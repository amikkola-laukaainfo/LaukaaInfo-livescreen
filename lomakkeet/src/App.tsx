import React, { useState, useEffect } from 'react';
import { FormRenderer } from './components/FormRenderer';
import { supabase } from './supabase';
import schemaIndex from './schemas/index.json';

// Dynamically import form schema based on URL ?form=<slug> param
async function loadSchema(slug: string) {
  try {
    const mod = await import(`./schemas/${slug}.json`);
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

export default function App() {
  const [schema, setSchema] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const defaultSlug = (schemaIndex as any[])[0]?.slug || 'lomake';
    const slug = params.get('form') || defaultSlug;
    loadSchema(slug).then(s => {
      if (s) setSchema(s);
      else setError(`Lomaketta "${slug}" ei löydy. Tarkista URL-parametri ?form=`);
      setLoading(false);
    });
  }, []);

  const handleVerifyCode = async (code: string) => {
    if (!supabase || !schema) return { success: true };
    const { data, error } = await supabase.rpc('verify_publication_access_code', {
      p_publication_id: schema.publication?.publicationId || null,
      p_code: code
    });
    if (error) return { success: false, error: error.message };
    return { success: data?.success ?? false, error: data?.error };
  };

  const handleSubmitResponse = async (answers: Record<string, any>, accessCode?: string) => {
    if (supabase && schema) {
      const { data, error } = await supabase.rpc('submit_form_response_secure', {
        p_publication_id: schema.publication?.publicationId || null,
        p_answers: answers,
        p_access_code: accessCode || null
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Lähetys epäonnistui');
      return data;
    } else {
      console.log('[Demo] Vastaukset:', answers);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4 border border-gray-100">
        <div className="text-4xl">🔍</div>
        <h1 className="text-xl font-bold text-gray-900">Lomaketta ei löydy</h1>
        <p className="text-sm text-gray-500">{error}</p>
        <div className="text-left bg-gray-50 p-4 rounded-xl border border-gray-200">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Käytettävissä olevat lomakkeet:</p>
          <div className="space-y-1.5">
            {(schemaIndex as any[]).map((s: any) => (
              <a
                key={s.slug}
                href={`?form=${s.slug}`}
                className="block p-2 rounded-lg text-xs bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 text-indigo-700 font-medium transition-all"
              >
                {s.title}
                <span className="block text-[10px] text-gray-400 font-mono mt-0.5">?form={s.slug}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen py-10 px-4 flex flex-col justify-center bg-gray-50">
      <FormRenderer
        schema={schema}
        onVerifyCode={handleVerifyCode}
        onSubmitResponse={handleSubmitResponse}
      />
    </div>
  );
}

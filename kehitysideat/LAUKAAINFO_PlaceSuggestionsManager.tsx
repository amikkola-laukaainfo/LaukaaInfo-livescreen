import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, MapPin, Loader2, ArrowRight } from 'lucide-react';

interface PlaceSuggestion {
  id: string;
  name: string;
  type: string | null;
  lat: number | null;
  lon: number | null;
  created_by: string;
  created_at: string;
  status: string;
  merged_to_place_id: string | null;
}

export const PlaceSuggestionsManager: React.FC = () => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('place_suggestions')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSuggestions(data || []);
    } catch (err) {
      console.error('Error fetching place suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('place_suggestions')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch (err: any) {
      alert('Virhe päivitettäessä: ' + err.message);
    }
  };

  const handleMergeToPlace = async (suggestion: PlaceSuggestion) => {
    const ok = window.confirm(`Haluatko luoda uuden paikan "${suggestion.name}"?`);
    if (!ok) return;

    try {
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/[äå]/g, 'a')
          .replace(/[ö]/g, 'o')
          .replace(/[üú]/g, 'u')
          .replace(/[éè]/g, 'e')
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '_');

      let canonicalName = `${normalize(suggestion.name)}_laukaa`;

      // Tarkistetaan mahdolliset duplikaatit
      const { data: existingPlaces } = await supabase
        .from('places')
        .select('canonical_name')
        .eq('canonical_name', canonicalName);

      if (existingPlaces && existingPlaces.length > 0) {
        canonicalName = `${canonicalName}_${Date.now().toString().slice(-4)}`;
      }

      // 1. Luodaan paikka 'places' -tauluun (huom: 'created_by' ja 'source' eivät kuulu places-tauluun)
      const newPlaceData: any = {
        id: crypto.randomUUID(),
        name: suggestion.name.trim(),
        canonical_name: canonicalName,
        type: suggestion.type || 'LANDMARK',
        place_type: 'KOHDE',
        municipality: 'Laukaa',
        status: 'PUBLISHED',
        verified: true,
        importance: 10,
        lat: suggestion.lat || null,
        lon: suggestion.lon || null
      };

      if ((suggestion as any).description) {
        newPlaceData.description = (suggestion as any).description;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from('places')
        .insert(newPlaceData)
        .select()
        .single();

      if (insertError) throw insertError;

      const createdId = insertedData ? (insertedData.place_id || insertedData.id) : null;

      // 2. Tallennetaan ehdottajan tiedot place_sources-tauluun jos saatavilla
      if (createdId && suggestion.created_by) {
        try {
          await supabase.from('place_sources').insert({
            place_id: createdId,
            source_type: 'SUGGESTION',
            title: `Käyttäjäehdotus: ${suggestion.name}`,
            content: `Ehdotettu käyttäjältä: ${suggestion.created_by}`,
            source: 'COMMUNITY',
            priority: 50
          });
        } catch (srcErr) {
          console.warn('Ei voitu luoda merkintää place_sources-tauluun:', srcErr);
        }
      }

      // 3. Päivitetään ehdotuksen tila MERGED-tilaan
      const { error: updateError } = await supabase
        .from('place_suggestions')
        .update({ status: 'MERGED', merged_to_place_id: createdId })
        .eq('id', suggestion.id);
      
      if (updateError) throw updateError;

      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      alert('Uusi paikka luotu onnistuneesti!');
    } catch (err: any) {
      alert('Virhe luotaessa paikkaa: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <MapPin className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p>Ei uusia paikkaehdotuksia.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
          <tr>
            <th className="px-5 py-3.5 font-medium">Nimi</th>
            <th className="px-5 py-3.5 font-medium">Käyttäjä</th>
            <th className="px-5 py-3.5 font-medium">Sijainti</th>
            <th className="px-5 py-3.5 font-medium text-right">Toiminnot</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {suggestions.map(s => (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="px-5 py-3.5 font-medium text-slate-900">{s.name}</td>
              <td className="px-5 py-3.5 text-slate-500 text-xs truncate max-w-[150px]">{s.created_by}</td>
              <td className="px-5 py-3.5 text-slate-500">
                {s.lat && s.lon ? `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}` : '-'}
              </td>
              <td className="px-5 py-3.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button 
                    onClick={() => handleUpdateStatus(s.id, 'REJECTED')}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                    title="Hylkää"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleMergeToPlace(s)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded font-medium text-xs transition-colors"
                  >
                    Luo paikka <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

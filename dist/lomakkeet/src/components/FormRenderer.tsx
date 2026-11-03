import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Lock, 
  Sparkles, 
  AlertCircle, 
  Send,
  Layers,
  HelpCircle,
  KeyRound
} from 'lucide-react';

export interface FormRendererProps {
  schema: any;
  onSubmitResponse?: (answers: Record<string, any>, accessCode?: string) => Promise<any> | any;
  onVerifyCode?: (code: string) => Promise<{ success: boolean; error?: string }>;
  brandColor?: string;
}

export function FormRenderer({ 
  schema, 
  onSubmitResponse,
  onVerifyCode,
  brandColor = '#4f46e5' 
}: FormRendererProps) {
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(
    schema.publication?.access !== 'CODE' && schema.publication?.access !== 'PERSONAL'
  );
  const [accessError, setAccessError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sections = useMemo(() => {
    return [...(schema.sections || [])].sort((a: any, b: any) => a.order - b.order);
  }, [schema.sections]);

  const questions = schema.questions || [];
  const logicRules = schema.logic || [];

  // Unlock check: Server-side RPC verification or fallback pass-through
  const handleUnlockWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const provided = accessCodeInput.trim().toUpperCase();
    if (!provided) {
      setAccessError('Syötä pääsykoodi jatkaaksesi.');
      return;
    }

    if (onVerifyCode) {
      setIsVerifyingCode(true);
      setAccessError('');
      try {
        const result = await onVerifyCode(provided);
        if (result.success) {
          setIsUnlocked(true);
        } else {
          setAccessError(result.error || 'Virheellinen tai vanhentunut koodi.');
        }
      } catch (err: any) {
        setAccessError(err.message || 'Koodin tarkistus epäonnistui.');
      } finally {
        setIsVerifyingCode(false);
      }
    } else {
      // Local fallback / pass-through to submission check
      setIsUnlocked(true);
      setAccessError('');
    }
  };

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (validationErrors[questionId]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const currentSection = sections[currentSectionIndex] || sections[0];
  const sectionQuestions = questions.filter(
    (q: any) => q.sectionId === currentSection?.id
  );

  // Validate current section
  const validateCurrentSection = () => {
    const errors: Record<string, string> = {};
    for (const q of sectionQuestions) {
      const val = answers[q.id];
      if (q.required) {
        if (val === undefined || val === null || val === '') {
          errors[q.id] = 'Tämä kenttä on pakollinen';
        }
      }
      if (q.type === 'EMAIL' && val) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val)) {
          errors[q.id] = 'Anna kelvollinen sähköpostiosoite';
        }
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Find next section based on branching logic
  const getNextSectionIndex = () => {
    for (const q of sectionQuestions) {
      const userVal = answers[q.id];
      if (!userVal) continue;

      const matchingRule = logicRules.find(
        (r: any) => r.sourceQuestionId === q.id && r.value === userVal
      );

      if (matchingRule) {
        const targetIdx = sections.findIndex(
          (s: any) => s.id === matchingRule.targetSectionId
        );
        if (targetIdx !== -1) {
          return targetIdx;
        }
      }
    }
    return currentSectionIndex + 1;
  };

  const handleNext = async () => {
    if (!validateCurrentSection()) return;

    if (currentSectionIndex < sections.length - 1) {
      const nextIdx = getNextSectionIndex();
      setCurrentSectionIndex(nextIdx);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Submit response
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        if (onSubmitResponse) {
          await onSubmitResponse(answers, accessCodeInput.trim().toUpperCase());
        }
        setIsSubmitted(true);
      } catch (err: any) {
        setSubmitError(err.message || 'Vastauksen lähetys epäonnistui. Yritä uudelleen.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handlePrev = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // If locked by access code
  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 text-center">
        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center mx-auto mb-5 text-indigo-600 dark:text-indigo-400">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">
          Suojattu lomake
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
          Tämä lomake vaatii henkilökohtaisen tai hankekohtaisen pääsykoodin vastaamista varten.
        </p>

        <form onSubmit={handleUnlockWithCode} className="space-y-4">
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
            <input
              type="text"
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value)}
              placeholder="SYÖTÄ KOODI (esim. MIX-2026-01)"
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-xl text-xs uppercase tracking-wider font-mono font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {accessError && (
            <p className="text-xs text-red-500 font-medium flex items-center justify-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {accessError}
            </p>
          )}

          <button
            type="submit"
            disabled={isVerifyingCode}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none transition-all disabled:opacity-50"
          >
            {isVerifyingCode ? 'Tarkistetaan...' : 'Avaa lomake'}
          </button>
        </form>
      </div>
    );
  }

  // Submitted view
  if (isSubmitted) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 text-center">
        <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/60 rounded-2xl flex items-center justify-center mx-auto mb-5 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">
          Kiitos vastauksestasi!
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
          Vastauksesi on tallennettu onnistuneesti Mediazoo-lomakepalveluun ja siirretty käsittelyyn.
        </p>
        <button
          onClick={() => {
            setIsSubmitted(false);
            setAnswers({});
            setCurrentSectionIndex(0);
          }}
          className="text-xs text-indigo-600 hover:underline font-semibold"
        >
          Vastaa uudelleen
        </button>
      </div>
    );
  }

  const progressPercent = Math.round(((currentSectionIndex + 1) / Math.max(sections.length, 1)) * 100);

  return (
    <div className="max-w-2xl mx-auto my-8 bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-6 md:p-8 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-br from-indigo-50/40 via-white to-gray-50/40 dark:from-gray-800 dark:to-gray-850">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-900">
            {schema.project?.name || 'Mixonet'}
          </span>
          <span className="text-[11px] font-medium text-gray-400">
            Osio {currentSectionIndex + 1} / {sections.length}
          </span>
        </div>

        <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
          {schema.form?.title}
        </h1>
        {schema.form?.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {schema.form.description}
          </p>
        )}

        {/* Progress Bar */}
        {schema.presentation?.showProgress !== false && (
          <div className="mt-5 w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Section Content */}
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            {currentSection?.title}
          </h2>
          {currentSection?.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {currentSection.description}
            </p>
          )}
        </div>

        {submitError && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="space-y-6">
          {sectionQuestions.map((q: any) => {
            const val = answers[q.id] || '';
            const err = validationErrors[q.id];

            return (
              <div key={q.id} className="space-y-2">
                <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
                  {q.title}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {/* TEXT / NUMBER / EMAIL */}
                {['TEXT', 'NUMBER', 'EMAIL'].includes(q.type) && (
                  <input
                    type={q.type === 'NUMBER' ? 'number' : q.type === 'EMAIL' ? 'email' : 'text'}
                    value={val}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Kirjoita vastauksesi..."
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white transition-all"
                  />
                )}

                {/* PARAGRAPH */}
                {q.type === 'PARAGRAPH' && (
                  <textarea
                    rows={3}
                    value={val}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Kirjoita vapaa vastauksesi..."
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white transition-all"
                  />
                )}

                {/* CHOICE (RADIO) */}
                {q.type === 'CHOICE' && (
                  <div className="space-y-1.5 pt-1">
                    {(q.options || []).map((opt: string) => {
                      const isSelected = val === opt;
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 font-semibold' 
                              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={isSelected}
                            onChange={() => handleAnswerChange(q.id, opt)}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {err && (
                  <p className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> {err}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Navigation Buttons */}
      <div className="p-6 bg-gray-50/80 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
        {currentSectionIndex > 0 ? (
          <button
            onClick={handlePrev}
            className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Edellinen
          </button>
        ) : <div />}

        <button
          onClick={handleNext}
          disabled={isSubmitting}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-100 dark:shadow-none flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {isSubmitting ? (
            'Lähetetään...'
          ) : currentSectionIndex === sections.length - 1 ? (
            <>
              Lähetä vastaus <Send className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Seuraava <ChevronRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

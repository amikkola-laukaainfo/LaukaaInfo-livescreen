import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Image, Plus, Trash2, ExternalLink, CheckCircle, AlertCircle,
  Loader2, Sparkles, Filter, Layers, Search, Eye, RefreshCw, Check, Link as LinkIcon
} from 'lucide-react';
import {
  resolveGooglePhotosUrl,
  isGooglePhotosUrl,
  isGoogleDriveUrl
} from '../utils/googlePhotosResolver';

// ─── Tyypit ──────────────────────────────────────────────────────────────────

export interface ThemeImageItem {
  id: string;
  title: string;
  description: string | null;
  imagekit_path: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  place_media_tags: { tag_id: string }[];
}

export interface ThemeCategory {
  id: string;
  name: string;
  icon: string;
  badgeColor: string;
  description: string;
  primaryTag: string;
  suggestedTags: string[];
}

export const MAIN_THEME_CATEGORIES: ThemeCategory[] = [
  {
    id: 'maaseutu',
    name: 'Maaseutu & Kylät',
    icon: '🌾',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'Pellot, kylämiljööt, maaseutumaisemat, kylätalot ja maaseutukohteet',
    primaryTag: 'maaseutu',
    suggestedTags: ['maaseutu', 'kyla', 'kylatalot', 'kulttuurimaisema', 'pelto', 'lahiruoka']
  },
  {
    id: 'luonto',
    name: 'Luonto & Retkeily',
    icon: '🌲',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: 'Luontopolut, metsät, näköalapaikat, laavut ja retkeilyreitit',
    primaryTag: 'luonto',
    suggestedTags: ['luonto', 'retkeily', 'luontopolut', 'metsa', 'harju', 'laavut']
  },
  {
    id: 'vesistot',
    name: 'Vesistöt & Rannat',
    icon: '🌊',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
    description: 'Järvet, rannat, uimapaikat, satamat, kosket ja kanavat',
    primaryTag: 'vesistot',
    suggestedTags: ['vesistot', 'jarvi', 'uimarannat', 'koski', 'veneily', 'kanava']
  },
  {
    id: 'historia',
    name: 'Historia & Kulttuuri',
    icon: '🏛️',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    description: 'Museot, muinaisjäännökset, kirkot, vanhat rakennukset ja perinnekohteet',
    primaryTag: 'historia',
    suggestedTags: ['historia', 'kulttuuri', 'kulttuuriperinto', 'museot', 'kirkot', 'rakennukset']
  },
  {
    id: 'taajama',
    name: 'Taajama & Palvelut',
    icon: '🏢',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    description: 'Keskustat, kyläkeskukset, torit, kaupat ja palvelualueet',
    primaryTag: 'taajama',
    suggestedTags: ['taajama', 'keskusta', 'palvelut', 'kirkonkyla', 'lievestuore', 'vihtavuori']
  },
  {
    id: 'liikunta',
    name: 'Liikunta & Hyvinvointi',
    icon: '🏃',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
    description: 'Urheilupuistot, ladut, kentät, kuntosalit, kylpylät ja saunat',
    primaryTag: 'liikunta',
    suggestedTags: ['liikunta', 'urheilu', 'hyvinvointi', 'saunat', 'peurunka', 'hiihto']
  }
];

export const ThemeImagesManager: React.FC = () => {
  const [themeImages, setThemeImages] = useState<ThemeImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  // ── Lisäyslomakkeen tila ──────────────────────────────────────────────────
  const [inputUrl, setInputUrl] = useState('');
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveSuccess, setResolveSuccess] = useState(false);

  const [title, setTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('maaseutu');
  const [selectedTags, setSelectedTags] = useState<string[]>(['maaseutu']);
  const [customTagInput, setCustomTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Hae teemakuvat Supabasesta ─────────────────────────────────────────────
  const fetchThemeImages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('place_media')
        .select('id, title, description, imagekit_path, is_active, sort_order, created_at, place_media_tags(tag_id)')
        .eq('usage', 'THEME_FALLBACK')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setThemeImages((data as any) || []);
    } catch (err: any) {
      console.error('Virhe teemakuvien haussa:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThemeImages();
  }, []);

  // ── Automaattinen linkin ratkaisu ──────────────────────────────────────────
  const handleResolveUrl = async (rawUrl: string) => {
    const url = rawUrl.trim();
    setInputUrl(url);
    setResolveError(null);
    setResolveSuccess(false);

    if (!url) {
      setResolvedUrl('');
      return;
    }

    // Jos linkki on Google Kuvat- tai Drive-linkki, ratkaistaan se APIn kautta
    if (isGooglePhotosUrl(url) || isGoogleDriveUrl(url)) {
      setResolving(true);
      try {
        const res = await resolveGooglePhotosUrl(url);
        if (res.success && res.directUrl) {
          setResolvedUrl(res.directUrl);
          setResolveSuccess(true);
        } else {
          setResolveError(res.error || 'Linkin muunto epäonnistui');
        }
      } catch (e: any) {
        setResolveError('Virhe yhteydessä kuvan ratkaisijaan: ' + e.message);
      } finally {
        setResolving(false);
      }
    } else {
      // Tavallinen suora kuvaosoite
      setResolvedUrl(url);
      setResolveSuccess(true);
    }
  };

  // Kun kategoria vaihtuu lomakkeessa, päivitä oletustagit
  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    const cat = MAIN_THEME_CATEGORIES.find(c => c.id === catId);
    if (cat) {
      setSelectedTags([cat.primaryTag]);
    }
  };

  const toggleTag = (tag: string) => {
    const norm = tag.toLowerCase().trim();
    if (!norm) return;
    setSelectedTags(prev =>
      prev.includes(norm) ? prev.filter(t => t !== norm) : [...prev, norm]
    );
  };

  const handleAddCustomTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const tag = customTagInput.trim().toLowerCase();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags(prev => [...prev, tag]);
    }
    setCustomTagInput('');
  };

  // ── Kuvan tallennus Supabaseen ────────────────────────────────────────────
  const handleSaveThemeImage = async () => {
    const finalUrl = resolvedUrl || inputUrl;
    if (!finalUrl) {
      alert('Syötä tai ratkaise kuvan osoite ennen tallennusta.');
      return;
    }

    if (selectedTags.length === 0) {
      alert('Valitse kuvalle vähintään yksi teematagi.');
      return;
    }

    setSaving(true);
    try {
      // 1. Tallenna place_media -tauluun
      const { data: mediaData, error: mediaError } = await supabase
        .from('place_media')
        .insert({
          place_id: null, // teemakuva ei kuulu vain yhdelle paikalle
          media_type: 'IMAGE',
          usage: 'THEME_FALLBACK',
          imagekit_path: finalUrl,
          title: title.trim() || `Teemakuva: ${selectedTags.join(', ')}`,
          description: inputUrl !== finalUrl ? inputUrl : null, // tallenna alkuperäinen jakolinkki talteen
          is_active: true,
          sort_order: 10
        })
        .select()
        .single();

      if (mediaError) throw mediaError;

      // 2. Tallenna tagit place_media_tags -tauluun
      if (mediaData && mediaData.id) {
        const tagRows = selectedTags.map(tag_id => ({
          media_id: mediaData.id,
          tag_id
        }));

        const { error: tagError } = await supabase
          .from('place_media_tags')
          .insert(tagRows);

        if (tagError) {
          console.warn('Virhe tagien tallennuksessa:', tagError);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Tyhjennä lomake
      setInputUrl('');
      setResolvedUrl('');
      setTitle('');
      setResolveSuccess(false);

      // Päivitä lista
      await fetchThemeImages();
    } catch (err: any) {
      alert('Virhe teemakuvan tallennuksessa: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Poista kuva ───────────────────────────────────────────────────────────
  const handleDeleteImage = async (id: string) => {
    if (!confirm('Haluatko varmasti poistaa tämän teemakuvan?')) return;
    try {
      const { error } = await supabase.from('place_media').delete().eq('id', id);
      if (error) throw error;
      setThemeImages(prev => prev.filter(img => img.id !== id));
    } catch (err: any) {
      alert('Virhe poistettaessa: ' + err.message);
    }
  };

  // ── Kytke aktiivisuus ─────────────────────────────────────────────────────
  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('place_media')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      setThemeImages(prev =>
        prev.map(img => img.id === id ? { ...img, is_active: !currentStatus } : img)
      );
    } catch (err: any) {
      alert('Virhe päivitettäessä tilaa: ' + err.message);
    }
  };

  // ── Suodatus ──────────────────────────────────────────────────────────────
  const filteredImages = useMemo(() => {
    return themeImages.filter(img => {
      // Kategoriatäsmäys
      if (selectedFilterCategory !== 'ALL') {
        const cat = MAIN_THEME_CATEGORIES.find(c => c.id === selectedFilterCategory);
        if (cat) {
          const imgTags = (img.place_media_tags || []).map(t => t.tag_id.toLowerCase());
          const hasMatchingTag = cat.suggestedTags.some(st => imgTags.includes(st)) || imgTags.includes(cat.primaryTag);
          if (!hasMatchingTag) return false;
        }
      }

      // Tekstihaku
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchTitle = (img.title || '').toLowerCase().includes(q);
        const matchTag = (img.place_media_tags || []).some(t => t.tag_id.toLowerCase().includes(q));
        return matchTitle || matchTag;
      }

      return true;
    });
  }, [themeImages, selectedFilterCategory, searchFilter]);

  return (
    <div className="space-y-8">
      {/* ── Yläotsikko ja kuvaus ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 rounded-2xl p-6 border border-violet-100 shadow-xs">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-violet-600 rounded-xl text-white shadow-md shadow-violet-500/20">
              <Image className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Teemakohtaiset Hero-kuvat</h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Määritä fallback-kuvat teemoittain (esim. maaseutu, luonto, vesistöt). Jos kohteella ei ole omaa kuvaa, LaukaaInfo tarjoaa sen teemaan sopivan taustakuvan satunnaisen kaupunkikuvan sijaan.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1.5 bg-white border border-violet-200 text-violet-700 rounded-full shadow-xs">
              Yhteensä {themeImages.length} teemakuvaa
            </span>
          </div>
        </div>
      </div>

      {/* ── Lisää uusi teemakuva -kortti ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <Plus className="w-5 h-5 text-violet-600" />
          <h3 className="font-bold text-slate-900 text-base">Lisää uusi teemakuva (Google Kuvat / Suora linkki)</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Vasen sarake: Linkki ja tiedot */}
          <div className="lg:col-span-7 space-y-4">
            {/* Linkkikenttä */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kuvalinkki (Google Kuvat -jakolinkki, Google Drive tai suora URL)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Liitä tähän esim. https://photos.app.goo.gl/... tai suora kuva-osoite"
                    value={inputUrl}
                    onChange={e => handleResolveUrl(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all font-mono text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleResolveUrl(inputUrl)}
                  disabled={resolving || !inputUrl}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Muunna
                </button>
              </div>

              {/* Tilailmoitus ratkaisusta */}
              {resolving && (
                <div className="flex items-center gap-2 mt-2 text-xs text-violet-700 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Muunnetaan Google Kuvat -linkkiä ulkoisen APIn kautta suoraksi kuvalinkiksi...
                </div>
              )}
              {resolveSuccess && resolvedUrl && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-700 font-medium">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  Linkki muunnettu onnistuneesti suoraksi korkearesoluutiokuvaksi!
                </div>
              )}
              {resolveError && (
                <div className="flex items-start gap-1.5 mt-2 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{resolveError}</span>
                </div>
              )}
            </div>

            {/* Kuvan otsikko */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kuvan nimi / otsikko
              </label>
              <input
                type="text"
                placeholder="esim. Savion vehreä peltomaisema ja kylätie"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all"
              />
            </div>

            {/* Pääteeman valinta */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Pääteema / Konteksti
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MAIN_THEME_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedCategory === cat.id
                        ? 'border-violet-600 bg-violet-50/70 ring-2 ring-violet-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="text-lg mb-1">{cat.icon}</div>
                    <div className="font-bold text-xs text-slate-900">{cat.name}</div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">{cat.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tagit / Avainsanat */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kohdistustagit (Kuva täsmää kohteisiin näillä tageilla)
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-100 text-violet-800 rounded-lg text-xs font-semibold"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="hover:text-red-600 font-bold ml-1 text-sm leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Suositellut tagit kategorialle */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 mb-2">
                <span className="font-semibold text-[11px] text-slate-400">Pikalisää:</span>
                {MAIN_THEME_CATEGORIES.find(c => c.id === selectedCategory)?.suggestedTags.map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleTag(st)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      selectedTags.includes(st)
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    +{st}
                  </button>
                ))}
              </div>

              {/* Oma custom-tagi */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Lisää oma tagi ja paina Enter..."
                  value={customTagInput}
                  onChange={e => setCustomTagInput(e.target.value)}
                  onKeyDown={handleAddCustomTag}
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Lisää
                </button>
              </div>
            </div>

            {/* Tallenna-nappi */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveThemeImage}
                disabled={saving || (!resolvedUrl && !inputUrl)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-violet-500/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Tallennetaan teemakuvaa...' : 'Tallenna teemakuva Supabaseen'}
              </button>
              {saveSuccess && (
                <div className="text-center text-xs text-green-700 font-bold mt-2">
                  ✅ Teemakuva tallennettu onnistuneesti!
                </div>
              )}
            </div>
          </div>

          {/* Oikea sarake: Live-esikatselu */}
          <div className="lg:col-span-5 flex flex-col">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Esikatselu Hero-taustana
            </label>
            <div className="flex-1 min-h-[260px] bg-slate-900 rounded-2xl overflow-hidden relative border border-slate-200 flex flex-col justify-end p-5 shadow-inner">
              {resolvedUrl || inputUrl ? (
                <>
                  <img
                    src={resolvedUrl || inputUrl}
                    alt="Esikatselu"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setResolveError('Kuvan lataus epäonnistui. Tarkista osoite tai suojaus.')}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                  <Image className="w-12 h-12 mb-2 opacity-30 text-white" />
                  <p className="text-xs text-slate-400">Liitä kuvalinkki vasemmalle nähdäksesi esikatselun.</p>
                </div>
              )}

              {/* Malli hero-tekstistä */}
              <div className="relative z-10 text-white space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/80 backdrop-blur-xs text-white uppercase tracking-wider">
                    {MAIN_THEME_CATEGORIES.find(c => c.id === selectedCategory)?.name || 'Teemakuva'}
                  </span>
                  {selectedTags.slice(0, 2).map(t => (
                    <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-white">
                      #{t}
                    </span>
                  ))}
                </div>
                <h4 className="font-extrabold text-base text-white drop-shadow-sm">
                  {title || 'Kohteen esimerkkisivu (Hero)'}
                </h4>
                <p className="text-[11px] text-white/80 drop-shadow-xs line-clamp-1">
                  Näin kuva näkyy paikkasivun yläreunan Hero-taustakuvana.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Olemassa olevien teemakuvien suodatus ja lista ─────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Tallennetut teemakuvat ({filteredImages.length})</h3>
            <p className="text-xs text-slate-500">Käytössä olevat teemakohtaiset fallback-kuvat</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Tekstihaku */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Suodata kuvia..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-48 shadow-xs"
              />
            </div>

            {/* Suodatussirut */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedFilterCategory('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedFilterCategory === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kaikki ({themeImages.length})
              </button>
              {MAIN_THEME_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedFilterCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    selectedFilterCategory === cat.id
                      ? 'bg-white text-violet-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span className="hidden sm:inline">{cat.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ruudukko kuvista */}
        {loading ? (
          <div className="flex justify-center items-center py-20 bg-white rounded-2xl border border-slate-200">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <Image className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-700 text-sm">Ei teemakuvia valituilla ehdoilla</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Lisää ensimmäinen kuva yläpuolella olevalla lomakkeella. Voit liittää suoran Google Kuvat -linkin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredImages.map(img => {
              const tags = (img.place_media_tags || []).map(t => t.tag_id);

              return (
                <div
                  key={img.id}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col ${
                    img.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
                  }`}
                >
                  {/* Kuva-alue */}
                  <div className="relative h-44 bg-slate-900 group">
                    <img
                      src={img.imagekit_path}
                      alt={img.title || 'Teemakuva'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-80" />

                    {/* Tagit kuvan päällä */}
                    <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
                      {tags.slice(0, 3).map(t => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 text-slate-800 backdrop-blur-xs shadow-xs"
                        >
                          #{t}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/70 text-slate-800">
                          +{tags.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Avaa täysikokoisena linkki */}
                    <a
                      href={img.imagekit_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute top-2.5 right-2.5 p-1.5 bg-black/40 hover:bg-black/70 text-white rounded-lg backdrop-blur-xs transition-colors"
                      title="Avaa kuva"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {/* Tila-badge */}
                    <div className="absolute bottom-2.5 left-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        img.is_active
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-500 text-white'
                      }`}>
                        {img.is_active ? 'Aktiivinen' : 'Ei käytössä'}
                      </span>
                    </div>
                  </div>

                  {/* Kortin tiedot */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1">
                        {img.title || 'Nimetön teemakuva'}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                        {tags.join(', ') || 'Ei teematageja'}
                      </p>
                    </div>

                    {/* Toiminnot */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(img.id, img.is_active)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                          img.is_active
                            ? 'text-slate-600 hover:bg-slate-100'
                            : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                      >
                        {img.is_active ? 'Poista käytöstä' : 'Ota käyttöön'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteImage(img.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Poista kuva"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

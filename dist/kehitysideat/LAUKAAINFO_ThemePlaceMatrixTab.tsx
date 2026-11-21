import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Grid3X3, RefreshCw, MapPin, Tag, AlertTriangle, CheckCircle2,
  Circle, ExternalLink, Filter, Search, BarChart3, ChevronDown, ChevronUp, X,
  Plus, Trash2, Loader2, Sparkles, Star, GitBranch, ArrowRightLeft, ShieldCheck, Check,
  BookOpen, FileText, Key, Eye, HelpCircle
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PlaceRow {
  place_id: string;
  name: string;
  type?: string;
  municipality?: string;
  status?: string;
  parent_place_id?: string;
}

export interface TagRow {
  tag_id: string;
  name: string;
  category?: string;
  places_count?: number;
}

export interface KnowledgeCardPost {
  id: string;
  type: string;
  title: string;
  description?: string;
  content?: string;
  image_url?: string;
  place_id?: string;
  status?: string;
  publisher_name?: string;
  access_key?: string;
  tags?: any;
  tag_ids?: string[];
  template_type?: string;
  created_at?: string;
  published_at?: string;
}

export interface CanonicalThemeMapping {
  place_id: string;
  tag_id: string;
  tier: 'PRIMARY' | 'SECONDARY';
  source: 'MANUAL' | 'AI' | 'IMPORT' | 'AI_BULK' | 'ADMIN_AI';
  confidence: number;
  review_status: 'APPROVED' | 'SUGGESTED' | 'REJECTED';
  scope: 'EXACT' | 'DESCENDANTS';
  created_at?: string;
  updated_at?: string;
}

export interface InheritedThemeMapping {
  place_id: string;
  tag_id: string;
  inherited_from_name: string;
  scope: 'DESCENDANTS';
}

interface CoverageStats {
  totalPlaces: number;
  totalTags: number;
  totalAssigned: number;
  maxPossible: number;
  coveragePct: number;
  placesWithNoTags: number;
  tagsWithNoPlaces: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function getLensInfo(tagName: string, category?: string): { lens: 'PAST' | 'PRESENT' | 'FUTURE' | 'GENERAL'; label: string; icon: string; color: string } {
  const norm = (tagName + ' ' + (category || '')).toUpperCase();
  if (norm.includes('HISTORIA') || norm.includes('KULTTUURI') || norm.includes('MUSEO') || norm.includes('PERINTÖ') || norm.includes('TARINA') || norm.includes('GEOLOGIA') || norm.includes('PAST')) {
    return { lens: 'PAST', label: 'Mennyt', icon: '🏛️', color: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (norm.includes('KIERTOTALOUS') || norm.includes('KESTÄVÄ') || norm.includes('TULEVA') || norm.includes('INNOVAATIO') || norm.includes('FUTURE')) {
    return { lens: 'FUTURE', label: 'Tuleva', icon: '🚀', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
  }
  if (norm.includes('LUONTO') || norm.includes('RETKEILY') || norm.includes('LIIKUNTA') || norm.includes('HYVINVOINTI') || norm.includes('VESISTÖ') || norm.includes('UIMA') || norm.includes('LAAVU') || norm.includes('PALVELU') || norm.includes('PERHE') || norm.includes('PRESENT')) {
    return { lens: 'PRESENT', label: 'Nykyinen', icon: '🌿', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  }
  return { lens: 'GENERAL', label: 'Yleinen', icon: '🏷️', color: 'bg-slate-50 text-slate-800 border-slate-200' };
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export function ThemePlaceMatrixTab() {
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [mappings, setMappings] = useState<CanonicalThemeMapping[]>([]);
  const [knowledgeCards, setKnowledgeCards] = useState<KnowledgeCardPost[]>([]);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [selectedCardForEdit, setSelectedCardForEdit] = useState<Partial<KnowledgeCardPost> | null>(null);
  const [modalDefaultPlaceId, setModalDefaultPlaceId] = useState<string | undefined>(undefined);
  const [modalDefaultTagId, setModalDefaultTagId] = useState<string | undefined>(undefined);
  const [filterCardCoverage, setFilterCardCoverage] = useState<'all' | 'has_card' | 'missing_card'>('all');
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [placeSearch, setPlaceSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLens, setFilterLens] = useState<'all' | 'PAST' | 'PRESENT' | 'FUTURE'>('all');
  const [filterCoverage, setFilterCoverage] = useState<'all' | 'missing' | 'covered'>('all');
  const [showOnlyActiveTags, setShowOnlyActiveTags] = useState(false);
  const [maxPlaces, setMaxPlaces] = useState(50);
  const [maxTags, setMaxTags] = useState(30);
  const [view, setView] = useState<'matrix' | 'place-summary' | 'tag-summary'>('place-summary');

  // ── Datan lataus: Kanoninen theme_places + siirtymävarmistus ───────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [placesRes, tagsRes, themePlacesRes, placeTagsRes, entityTagsRes, postsRes, postThemesRes] = await Promise.all([
        supabase
          .from('places')
          .select('place_id, name, type, municipality, status, parent_place_id')
          .or('status.eq.active,status.eq.ACTIVE,status.eq.PUBLISHED,status.eq.DISCOVERED,status.is.null')
          .order('name'),
        supabase
          .from('tags')
          .select('tag_id, name, category')
          .order('name'),
        supabase
          .from('theme_places')
          .select('*'),
        supabase
          .from('place_tags')
          .select('place_id, tag_id, source'),
        supabase
          .from('entity_tags')
          .select('entity_id, tag_id, source, weight')
          .ilike('entity_type', 'place'),
        supabase
          .from('posts')
          .select('id, type, title, description, content, image_url, place_id, status, publisher_name, access_key, tags, created_at, published_at')
          .in('type', ['INFO', 'knowledge', 'article', 'info']),
        supabase
          .from('post_themes')
          .select('post_id, tag_id')
      ]);

      if (placesRes.error) throw placesRes.error;
      if (tagsRes.error) throw tagsRes.error;

      const loadedPlaces: PlaceRow[] = placesRes.data || [];
      const placeIdSet = new Set(loadedPlaces.map(p => p.place_id));
      const rawTags: TagRow[] = tagsRes.data || [];
      const tagIdSet = new Set(rawTags.map(t => t.tag_id));

      // Yhdistetään tietueet siten, että:
      // 1. theme_places on kanoninen päätietolähde
      // 2. Jos kytkentä on olemassa entity_tags tai place_tags, mutta ei vielä theme_places:
      //    otetaan se mukaan ja säilytetään AI/MANUAL lähdetiedot
      const mappingMap = new Map<string, CanonicalThemeMapping>();

      // 1. theme_places
      (themePlacesRes.data || []).forEach((tp: any) => {
        if (tp.place_id && tp.tag_id && placeIdSet.has(tp.place_id) && tagIdSet.has(tp.tag_id)) {
          const key = `${tp.place_id}::${tp.tag_id}`;
          mappingMap.set(key, {
            place_id: tp.place_id,
            tag_id: tp.tag_id,
            tier: tp.tier || 'PRIMARY',
            source: tp.source || 'MANUAL',
            confidence: tp.confidence ?? 100,
            review_status: tp.review_status || 'APPROVED',
            scope: tp.scope || 'EXACT',
            created_at: tp.created_at,
            updated_at: tp.updated_at
          });
        }
      });

      // 2. place_tags (siirtymäajan fallback)
      (placeTagsRes.data || []).forEach((pt: any) => {
        if (pt.place_id && pt.tag_id && placeIdSet.has(pt.place_id) && tagIdSet.has(pt.tag_id)) {
          const key = `${pt.place_id}::${pt.tag_id}`;
          if (!mappingMap.has(key)) {
            mappingMap.set(key, {
              place_id: pt.place_id,
              tag_id: pt.tag_id,
              tier: 'PRIMARY',
              source: (pt.source as any) || 'MANUAL',
              confidence: 100,
              review_status: 'APPROVED',
              scope: 'EXACT'
            });
          }
        }
      });

      // 3. entity_tags (siirtymäajan fallback, esim. Lievestuoreen aseman AI-teemat)
      (entityTagsRes.data || []).forEach((et: any) => {
        if (et.entity_id && et.tag_id && placeIdSet.has(et.entity_id) && tagIdSet.has(et.tag_id)) {
          const key = `${et.entity_id}::${et.tag_id}`;
          if (!mappingMap.has(key)) {
            mappingMap.set(key, {
              place_id: et.entity_id,
              tag_id: et.tag_id,
              tier: 'PRIMARY',
              source: (et.source as any) || 'AI',
              confidence: et.weight || 100,
              review_status: 'APPROVED',
              scope: 'EXACT'
            });
          }
        }
      });

      const combinedMappings = Array.from(mappingMap.values());

      // Laske paikkamäärät teemoille
      const tagPlaceCounts: Record<string, number> = {};
      combinedMappings.forEach(m => {
        if (m.review_status !== 'REJECTED') {
          tagPlaceCounts[m.tag_id] = (tagPlaceCounts[m.tag_id] || 0) + 1;
        }
      });

      const enrichedTags = rawTags.map(t => ({
        ...t,
        places_count: tagPlaceCounts[t.tag_id] || 0
      }));

      // Tietokortit
      const rawPosts = (postsRes.data || []) as any[];
      const postThemes = (postThemesRes.data || []) as any[];
      const postTagMap = new Map<string, string[]>();
      postThemes.forEach(pt => {
        if (!postTagMap.has(pt.post_id)) postTagMap.set(pt.post_id, []);
        postTagMap.get(pt.post_id)!.push(pt.tag_id);
      });

      const loadedCards: KnowledgeCardPost[] = rawPosts.map(p => ({
        ...p,
        tag_ids: postTagMap.get(p.id) || (Array.isArray(p.tags) ? p.tags : [p.tags].filter(Boolean))
      }));

      setPlaces(loadedPlaces);
      setTags(enrichedTags);
      setMappings(combinedMappings);
      setKnowledgeCards(loadedCards);
    } catch (e: any) {
      console.error('ThemePlaceMatrix loadData error:', e);
      setError(e.message || 'Tuntematon virhe ladattaessa teemadataa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Periytyvät teemat hierarkian perusteella (lasketaan dynaamisesti) ────────
  const inheritedMappings = useMemo(() => {
    const inherited: InheritedThemeMapping[] = [];
    const placeMap = new Map<string, PlaceRow>(places.map(p => [p.place_id, p]));

    // Etsitään teemat, joissa scope = 'DESCENDANTS'
    const descendantRules = mappings.filter(m => m.scope === 'DESCENDANTS' && m.review_status === 'APPROVED');
    if (descendantRules.length === 0) return inherited;

    const directKeys = new Set(mappings.map(m => `${m.place_id}::${m.tag_id}`));

    // Käydään paikat läpi ja katsotaan periytyminen parent_place_id:n kautta
    places.forEach(child => {
      if (!child.parent_place_id) return;
      const parent = placeMap.get(child.parent_place_id);
      if (!parent) return;

      const parentRules = descendantRules.filter(r => r.place_id === parent.place_id);
      parentRules.forEach(rule => {
        const key = `${child.place_id}::${rule.tag_id}`;
        // Ei monisteta jos lapsella on jo suora kytkentä
        if (!directKeys.has(key)) {
          inherited.push({
            place_id: child.place_id,
            tag_id: rule.tag_id,
            inherited_from_name: parent.name,
            scope: 'DESCENDANTS'
          });
        }
      });
    });

    return inherited;
  }, [places, mappings]);

  // ── Yhteinen kanoninen tallennuslogiikka ─────────────────────────────────────
  const addOrUpdateMapping = async (
    place_id: string,
    tag_id: string,
    options?: Partial<Omit<CanonicalThemeMapping, 'place_id' | 'tag_id'>>
  ) => {
    try {
      setError(null);
      const targetPlace = places.find(p => p.place_id === place_id);
      const targetTag = tags.find(t => t.tag_id === tag_id);

      const placeType = (targetPlace?.type || '').toUpperCase();
      const defaultScope = (placeType === 'KUNTA' || placeType === 'ALUE' || placeType === 'KYLÄ') ? 'DESCENDANTS' : 'EXACT';

      const existing = mappings.find(m => m.place_id === place_id && m.tag_id === tag_id);
      
      // Tarkennus 3: Jos kyseessä on olemassa oleva MANUAL-tietue eikä pyyntö ole nimenomaisesti käyttäjän oma muutos, suojataan se
      const finalSource = options?.source || (existing ? existing.source : 'MANUAL');
      const finalTier = options?.tier || (existing ? existing.tier : 'PRIMARY');
      const finalScope = options?.scope || (existing ? existing.scope : defaultScope);
      const finalStatus = options?.review_status || (existing ? existing.review_status : 'APPROVED');
      const finalConfidence = options?.confidence ?? (existing ? existing.confidence : 100);

      // 1. Kanoninen tallennus theme_places -tauluun
      const payload: any = {
        place_id,
        tag_id,
        scope: finalScope
      };

      // Lisätään uudet sarakkeet
      payload.tier = finalTier;
      payload.source = finalSource;
      payload.confidence = finalConfidence;
      payload.review_status = finalStatus;

      const { error: tpErr } = await supabase
        .from('theme_places')
        .upsert(payload, { onConflict: 'tag_id,place_id' });

      if (tpErr) {
        // Jos kannassa ei vielä ole uutta tier/review_status saraketta ennen migraatiota 057, tallennetaan perusmuodossa
        if (tpErr.code === '42703' || tpErr.message?.includes('column')) {
          console.warn('theme_places extended columns pending migration 057, saving base fields:', tpErr.message);
          const { error: baseErr } = await supabase
            .from('theme_places')
            .upsert({ place_id, tag_id, scope: finalScope }, { onConflict: 'tag_id,place_id' });
          if (baseErr) throw baseErr;
        } else {
          throw tpErr;
        }
      }

      // 2. Pidetään place_tags rinnalla siirtymävaiheessa
      try {
        await supabase
          .from('place_tags')
          .upsert({ place_id, tag_id, source: finalSource }, { onConflict: 'place_id,tag_id' });
      } catch (e) {}

      // Päivitetään paikallinen tila välittömästi ilman viivettä
      setMappings(prev => {
        const filtered = prev.filter(m => !(m.place_id === place_id && m.tag_id === tag_id));
        return [
          ...filtered,
          {
            place_id,
            tag_id,
            tier: finalTier,
            source: finalSource,
            confidence: finalConfidence,
            review_status: finalStatus,
            scope: finalScope
          }
        ];
      });

      // Päivitä myös teeman places_count
      setTags(prev => prev.map(t => {
        if (t.tag_id === tag_id && !existing) {
          return { ...t, places_count: (t.places_count || 0) + 1 };
        }
        return t;
      }));

      setActionSuccess(`Kytketty: ${targetPlace?.name || 'Paikka'} ⇄ ${targetTag?.name || 'Teema'}`);
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (e: any) {
      console.error('addOrUpdateMapping error:', e);
      setError(e.message || 'Virhe tallennettaessa teemakytkentää');
    }
  };

  // ── Yhteinen kanoninen poistologiikka ───────────────────────────────────────
  const removeThemeMapping = async (place_id: string, tag_id: string) => {
    try {
      setError(null);
      const targetPlace = places.find(p => p.place_id === place_id);
      const targetTag = tags.find(t => t.tag_id === tag_id);

      // 1. Poistetaan kanonisesta theme_places -taulusta
      const { error: tpErr } = await supabase
        .from('theme_places')
        .delete()
        .eq('place_id', place_id)
        .eq('tag_id', tag_id);

      if (tpErr) throw tpErr;

      // 2. Poistetaan myös siirtymätauluista
      try {
        await supabase.from('place_tags').delete().eq('place_id', place_id).eq('tag_id', tag_id);
        await supabase.from('entity_tags').delete().ilike('entity_type', 'place').eq('entity_id', place_id).eq('tag_id', tag_id);
      } catch (e) {}

      // Päivitetään paikallinen tila välittömästi
      setMappings(prev => prev.filter(m => !(m.place_id === place_id && m.tag_id === tag_id)));
      setTags(prev => prev.map(t => {
        if (t.tag_id === tag_id) {
          return { ...t, places_count: Math.max(0, (t.places_count || 1) - 1) };
        }
        return t;
      }));

      setActionSuccess(`Poistettu kytkentä: ${targetPlace?.name || 'Paikka'} ✕ ${targetTag?.name || 'Teema'}`);
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (e: any) {
      console.error('removeThemeMapping error:', e);
      setError(e.message || 'Virhe poistettaessa teemakytkentää');
    }
  };

  // ── Uuden teeman luonti suoraan matriisista ──────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeCategory, setNewThemeCategory] = useState('THEME');
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);

  const handleCreateTheme = async () => {
    const trimmed = newThemeName.trim();
    if (!trimmed) return;
    setIsCreatingTheme(true);
    try {
      const tagId = trimmed.toLowerCase()
        .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-');

      const { error: err } = await supabase.from('tags').upsert({
        tag_id: tagId,
        name: trimmed,
        category: newThemeCategory.trim() || 'THEME',
        status: 'PUBLISHED',
        tag_level: 1,
        icon: '🏷️'
      });
      if (err) throw err;
      setNewThemeName('');
      setShowCreateModal(false);
      await loadData();
    } catch (e: any) {
      alert('Virhe teeman luonnissa: ' + e.message);
    } finally {
      setIsCreatingTheme(false);
    }
  };

  // ── Teeman poisto kokonaan järjestelmästä ────────────────────────────────────
  const handleDeleteTheme = async (tag: TagRow) => {
    if (!window.confirm(`Haluatko varmasti poistaa teeman "${tag.name}" (${tag.tag_id}) kokonaan järjestelmästä?\n\nTämä poistaa myös kaikki paikkojen ja toimijoiden kytkennät tähän teemaan.`)) {
      return;
    }
    try {
      setError(null);
      await supabase.from('theme_places').delete().eq('tag_id', tag.tag_id);
      await supabase.from('place_tags').delete().eq('tag_id', tag.tag_id);
      await supabase.from('entity_tags').delete().eq('tag_id', tag.tag_id);
      await supabase.from('tags').update({ active: false, status: 'ARCHIVED' }).eq('tag_id', tag.tag_id);
      try { await supabase.from('tags').delete().eq('tag_id', tag.tag_id); } catch (e) {}
      await loadData();
    } catch (e: any) {
      setError('Virhe teeman poistossa: ' + e.message);
    }
  };

  // ── Tietokorttien hallinta ja luonti ─────────────────────────────────────────
  const handleOpenKnowledgeModal = (placeId?: string, tagId?: string, card?: KnowledgeCardPost) => {
    setSelectedCardForEdit(card || null);
    setModalDefaultPlaceId(placeId);
    setModalDefaultTagId(tagId);
    setIsKnowledgeModalOpen(true);
  };

  const handleSaveKnowledgeCard = async (
    cardData: Partial<KnowledgeCardPost>,
    targetPlaceId: string,
    targetTagId: string
  ) => {
    try {
      const postId = cardData.id || crypto.randomUUID();
      const newPost: any = {
        id: postId,
        type: 'INFO',
        title: (cardData.title || '').trim(),
        description: (cardData.description || '').trim(),
        content: (cardData.content || '').trim(),
        place_id: targetPlaceId,
        image_url: (cardData.image_url || '').trim() || null,
        publisher_name: (cardData.publisher_name || '').trim() || 'LaukaaInfo Toimitus',
        access_key: (cardData.access_key || '').trim() || null,
        status: cardData.status || 'published',
        visibility: 'public',
        published_at: cardData.published_at || new Date().toISOString()
      };

      const { error: postErr } = await supabase.from('posts').upsert(newPost);
      if (postErr) throw postErr;

      // Linkki post_themes -tauluun
      if (targetTagId) {
        try {
          await supabase.from('post_themes').upsert({
            post_id: postId,
            tag_id: targetTagId
          }, { onConflict: 'post_id,tag_id' });
        } catch (ptErr) {
          console.warn('post_themes upsert error:', ptErr);
        }

        // Varmistetaan että myös paikka ja teema on kytketty matriisissa
        await addOrUpdateMapping(targetPlaceId, targetTagId, {
          tier: 'PRIMARY',
          source: 'MANUAL',
          review_status: 'APPROVED'
        });
      }

      setActionSuccess(`Tietokortti "${newPost.title}" tallennettu! (ID: ${postId})`);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData();
    } catch (e: any) {
      console.error('handleSaveKnowledgeCard error:', e);
      alert('Virhe tallennettaessa tietokorttia: ' + e.message);
    }
  };

  // ── Suodatus ja tilastot ─────────────────────────────────────────────────────
  const categories: string[] = ['all', ...(Array.from(new Set(tags.map(t => t.category || 'Muu'))) as string[]).sort()];

  const filteredTags = tags
    .filter(t => {
      if (showOnlyActiveTags && (t.places_count || 0) === 0) return false;
      if (filterCategory !== 'all' && (t.category || 'Muu') !== filterCategory) return false;
      if (filterLens !== 'all' && getLensInfo(t.name, t.category).lens !== filterLens) return false;
      if (tagSearch && !t.name.toLowerCase().includes(tagSearch.toLowerCase()) && !t.tag_id.toLowerCase().includes(tagSearch.toLowerCase())) return false;
      return true;
    })
    .slice(0, maxTags);

  const filteredPlaces = places
    .filter(p => !placeSearch || p.name.toLowerCase().includes(placeSearch.toLowerCase()) || (p.municipality || '').toLowerCase().includes(placeSearch.toLowerCase()));

  const stats: CoverageStats = {
    totalPlaces: places.length,
    totalTags: tags.length,
    totalAssigned: mappings.length,
    maxPossible: places.length * tags.length,
    coveragePct: places.length > 0 && tags.length > 0 ? Math.round((mappings.length / (places.length * tags.length)) * 1000) / 10 : 0,
    placesWithNoTags: places.filter(p => !mappings.some(m => m.place_id === p.place_id)).length,
    tagsWithNoPlaces: tags.filter(t => (t.places_count || 0) === 0).length
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex flex-wrap items-center gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <ArrowRightLeft size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900">Teema × Paikka -hallinta</h2>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Kaksisuuntainen V5.0
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Yksi kanoninen tietomalli (theme_places) — kaksi toisiaan päivittävää näkökulmaa</p>
          </div>
        </div>

        <div className="flex-1" />

        {/* View switcher */}
        <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1">
          <button
            onClick={() => setView('place-summary')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              view === 'place-summary' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin size={14} className={view === 'place-summary' ? 'text-emerald-600' : 'text-slate-400'} />
            📍 Paikat
          </button>
          <button
            onClick={() => setView('tag-summary')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              view === 'tag-summary' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag size={14} className={view === 'tag-summary' ? 'text-emerald-600' : 'text-slate-400'} />
            🏷️ Teemat
          </button>
          <button
            onClick={() => setView('matrix')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              view === 'matrix' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Grid3X3 size={14} className={view === 'matrix' ? 'text-emerald-600' : 'text-slate-400'} />
            📊 Matriisi
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <Plus size={14} /> Uusi teema
        </button>
        <button
          onClick={() => handleOpenKnowledgeModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <BookOpen size={14} /> 📖 Uusi tietokortti
        </button>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Päivitä
        </button>
      </div>

      {/* Action success alert */}
      {actionSuccess && (
        <div className="mx-6 mt-3 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold">Tallennettu suoraan theme_places -kantaan</span>
        </div>
      )}

      {/* Informatiivinen arkkitehtuuribanneri */}
      <div className="mx-6 mt-3 px-4 py-2.5 bg-gradient-to-r from-emerald-50/80 via-indigo-50/80 to-blue-50/80 border border-emerald-200/60 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck size={16} />
          </div>
          <div>
            <span className="font-black text-slate-900">Kaksisuuntainen eheys: </span>
            <span className="text-slate-600">
              Muokkaus <strong>Paikat</strong>- tai <strong>Teemat</strong>-välilehdeltä tallentuu samaan tietueeseen.
              Teeman merkitystaso: <span className="font-bold text-emerald-700">★ Ensisijainen (PRIMARY)</span> vs{' '}
              <span className="font-bold text-slate-600">● Toissijainen (SECONDARY)</span>.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span> MANUAL (Käsin)
          </span>
          <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span> AI (Suojattu)
          </span>
          <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5">
            <span>🌿</span> Periytyvä (Laskennallinen)
          </span>
        </div>
      </div>

      {/* Tilastorivi */}
      <div className="grid grid-cols-3 sm:grid-cols-8 gap-2 px-6 py-2.5 bg-white border-b border-slate-200 mt-3">
        {[
          { label: 'Paikkoja', value: stats.totalPlaces, icon: '📍', col: 'text-blue-700' },
          { label: 'Teemoja', value: stats.totalTags, icon: '🏷️', col: 'text-indigo-700' },
          { label: 'Kytkentöjä', value: stats.totalAssigned, icon: '🔗', col: 'text-emerald-700' },
          { label: 'Tietokortit', value: knowledgeCards.length, icon: '📖', col: 'text-amber-700' },
          { label: 'Kattavuus', value: stats.coveragePct + '%', icon: '📈', col: 'text-orange-700' },
          { label: 'Ilman teemaa', value: stats.placesWithNoTags, icon: '⚠️', col: stats.placesWithNoTags > 0 ? 'text-red-600' : 'text-emerald-600' },
          { label: 'Tyhjät teemat', value: stats.tagsWithNoPlaces, icon: '🔴', col: stats.tagsWithNoPlaces > 0 ? 'text-amber-600' : 'text-emerald-600' },
          { label: 'Periytyviä', value: inheritedMappings.length, icon: '🌿', col: 'text-teal-700' },
        ].map(s => (
          <div key={s.label} className="bg-slate-50 rounded-xl border border-slate-200 px-3 py-1.5 text-center">
            <div className="text-xs">{s.icon}</div>
            <div className={`text-sm font-black ${s.col}`}>{s.value}</div>
            <div className="text-[9px] text-slate-500 font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Päänäkymä */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <RefreshCw size={28} className="animate-spin text-emerald-600" />
            <span className="text-sm font-semibold">Ladataan teema- ja paikkadataa…</span>
          </div>
        </div>
      ) : view === 'place-summary' ? (
        <UnifiedPlaceView
          places={filteredPlaces}
          tags={tags}
          mappings={mappings}
          inheritedMappings={inheritedMappings}
          placeSearch={placeSearch}
          setPlaceSearch={setPlaceSearch}
          filterCoverage={filterCoverage}
          setFilterCoverage={setFilterCoverage}
          onAddOrUpdateMapping={addOrUpdateMapping}
          onRemoveMapping={removeThemeMapping}
        />
      ) : view === 'tag-summary' ? (
        <UnifiedThemeView
          tags={filteredTags}
          places={places}
          mappings={mappings}
          tagSearch={tagSearch}
          setTagSearch={setTagSearch}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          categories={categories}
          filterLens={filterLens}
          setFilterLens={setFilterLens}
          showOnlyActiveTags={showOnlyActiveTags}
          setShowOnlyActiveTags={setShowOnlyActiveTags}
          onAddOrUpdateMapping={addOrUpdateMapping}
          onRemoveMapping={removeThemeMapping}
          onDeleteTheme={handleDeleteTheme}
        />
      ) : (
        <UnifiedMatrixView
          places={filteredPlaces.slice(0, maxPlaces)}
          tags={filteredTags.slice(0, maxTags)}
          mappings={mappings}
          inheritedMappings={inheritedMappings}
          placeSearch={placeSearch}
          setPlaceSearch={setPlaceSearch}
          tagSearch={tagSearch}
          setTagSearch={setTagSearch}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          categories={categories}
          filterLens={filterLens}
          setFilterLens={setFilterLens}
          filterCoverage={filterCoverage}
          setFilterCoverage={setFilterCoverage}
          showOnlyActiveTags={showOnlyActiveTags}
          setShowOnlyActiveTags={setShowOnlyActiveTags}
          maxPlaces={maxPlaces}
          setMaxPlaces={setMaxPlaces}
          maxTags={maxTags}
          setMaxTags={setMaxTags}
          knowledgeCards={knowledgeCards}
          onOpenKnowledgeCard={handleOpenKnowledgeModal}
          filterCardCoverage={filterCardCoverage}
          setFilterCardCoverage={setFilterCardCoverage}
          onAddOrUpdateMapping={addOrUpdateMapping}
          onRemoveMapping={removeThemeMapping}
        />
      )}

      {/* Uuden teeman luonti -dialogi */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Tag size={16} />
                </div>
                <h3 className="font-bold text-base text-slate-900">Luo uusi teema</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Teeman nimi *</label>
                <input
                  type="text"
                  value={newThemeName}
                  onChange={e => setNewThemeName(e.target.value)}
                  placeholder="Esim. Kyläyhteisö, Teollisuushistoria, Rantareitit..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Kategoria</label>
                <input
                  type="text"
                  value={newThemeCategory}
                  onChange={e => setNewThemeCategory(e.target.value)}
                  placeholder="Esim. THEME, Kulttuuri, Luonto..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Peruuta
              </button>
              <button
                type="button"
                onClick={handleCreateTheme}
                disabled={!newThemeName.trim() || isCreatingTheme}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {isCreatingTheme ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Luo teema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tietokortin luonti / muokkaus -dialogi */}
      {isKnowledgeModalOpen && (
        <KnowledgeCardModal
          isOpen={isKnowledgeModalOpen}
          onClose={() => {
            setIsKnowledgeModalOpen(false);
            setSelectedCardForEdit(null);
          }}
          onSave={handleSaveKnowledgeCard}
          card={selectedCardForEdit}
          places={places}
          tags={tags}
          defaultPlaceId={modalDefaultPlaceId}
          defaultTagId={modalDefaultTagId}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. PAIKKANÄKYMÄ (📍 Paikat)
// ─────────────────────────────────────────────────────────────
interface UnifiedPlaceViewProps {
  places: PlaceRow[];
  tags: TagRow[];
  mappings: CanonicalThemeMapping[];
  inheritedMappings: InheritedThemeMapping[];
  placeSearch: string;
  setPlaceSearch: (s: string) => void;
  filterCoverage: string;
  setFilterCoverage: (s: string) => void;
  onAddOrUpdateMapping: (place_id: string, tag_id: string, opt?: any) => Promise<void>;
  onRemoveMapping: (place_id: string, tag_id: string) => Promise<void>;
}

function UnifiedPlaceView({
  places,
  tags,
  mappings,
  inheritedMappings,
  placeSearch,
  setPlaceSearch,
  filterCoverage,
  setFilterCoverage,
  onAddOrUpdateMapping,
  onRemoveMapping
}: UnifiedPlaceViewProps) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(places[0]?.place_id || null);
  const [selectedNewTagId, setSelectedNewTagId] = useState('');
  const [selectedNewTier, setSelectedNewTier] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  const [isAdding, setIsAdding] = useState(false);

  // Mappaukset paikoittain
  const placeMappingMap = useMemo(() => {
    const map = new Map<string, CanonicalThemeMapping[]>();
    mappings.forEach(m => {
      const arr = map.get(m.place_id) || [];
      arr.push(m);
      map.set(m.place_id, arr);
    });
    return map;
  }, [mappings]);

  const placeInheritedMap = useMemo(() => {
    const map = new Map<string, InheritedThemeMapping[]>();
    inheritedMappings.forEach(im => {
      const arr = map.get(im.place_id) || [];
      arr.push(im);
      map.set(im.place_id, arr);
    });
    return map;
  }, [inheritedMappings]);

  const tagMap = useMemo(() => new Map<string, TagRow>(tags.map(t => [t.tag_id, t])), [tags]);

  // Suodatettu paikkalista
  let filteredPlaces = places.filter(p => {
    if (placeSearch && !p.name.toLowerCase().includes(placeSearch.toLowerCase())) return false;
    const directCount = (placeMappingMap.get(p.place_id) || []).length;
    if (filterCoverage === 'missing' && directCount > 0) return false;
    if (filterCoverage === 'covered' && directCount === 0) return false;
    return true;
  });

  const activePlace = places.find(p => p.place_id === selectedPlaceId) || filteredPlaces[0] || null;
  const activeDirectMappings = activePlace ? (placeMappingMap.get(activePlace.place_id) || []) : [];
  const activeInheritedMappings = activePlace ? (placeInheritedMap.get(activePlace.place_id) || []) : [];

  const handleAdd = async () => {
    if (!activePlace || !selectedNewTagId) return;
    setIsAdding(true);
    try {
      await onAddOrUpdateMapping(activePlace.place_id, selectedNewTagId, {
        tier: selectedNewTier,
        source: 'MANUAL',
        review_status: 'APPROVED'
      });
      setSelectedNewTagId('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Vasen sarake: Paikkalista */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/50">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Etsi paikkaa (esim. Lievestuore)…"
              value={placeSearch}
              onChange={e => setPlaceSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
          <select
            value={filterCoverage}
            onChange={e => setFilterCoverage(e.target.value)}
            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">Kaikki paikat ({places.length})</option>
            <option value="missing">Ilman suoraa teemaa</option>
            <option value="covered">Teemoitetut paikat</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredPlaces.map(p => {
            const count = (placeMappingMap.get(p.place_id) || []).length;
            const inhCount = (placeInheritedMap.get(p.place_id) || []).length;
            const isSelected = activePlace?.place_id === p.place_id;

            return (
              <button
                key={p.place_id}
                onClick={() => setSelectedPlaceId(p.place_id)}
                className={`w-full text-left p-3 transition-colors flex items-center justify-between ${
                  isSelected ? 'bg-emerald-50/90 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className={`text-xs font-bold truncate ${isSelected ? 'text-emerald-900' : 'text-slate-800'}`}>
                    {p.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                    {p.municipality && <span>{p.municipality}</span>}
                    {p.type && <span className="bg-slate-100 px-1 rounded text-slate-600 font-semibold">{p.type}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {count === 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">0</span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {count}
                    </span>
                  )}
                  {inhCount > 0 && (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200" title={`${inhCount} periytyvää teemaa`}>
                      +{inhCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {filteredPlaces.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-10">Ei paikkoja hakuehdoilla.</div>
          )}
        </div>
      </div>

      {/* Oikea sarake: Valitun paikan teemanäkymä */}
      {activePlace ? (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto p-6 space-y-6">
          {/* Paikan otsikkokortti */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">{activePlace.name}</h3>
                {activePlace.type && (
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                    {activePlace.type}
                  </span>
                )}
                {activePlace.municipality && (
                  <span className="text-xs font-semibold text-slate-500">({activePlace.municipality})</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">ID: {activePlace.place_id}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                Suorat teemat: <strong className="text-emerald-700">{activeDirectMappings.length}</strong>
              </span>
              {activeInheritedMappings.length > 0 && (
                <span className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200">
                  Periytyvät: <strong>{activeInheritedMappings.length}</strong>
                </span>
              )}
            </div>
          </div>

          {/* 1. Suorat teemat */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Paikkaan suoraan liitetyt teemat
                </h4>
                <p className="text-[11px] text-slate-500">
                  Tallennettu kanonisesti tauluun <code>theme_places</code>. Voit vaihtaa ensisijaisuutta suoraan tai poistaa teeman.
                </p>
              </div>
            </div>

            {activeDirectMappings.length === 0 ? (
              <div className="py-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                <AlertTriangle size={18} className="mx-auto text-amber-500 mb-1" />
                Paikalla ei ole yhtään suoraa teemaa. Lisää teema alapuolelta!
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeDirectMappings.map(m => {
                  const tag = tagMap.get(m.tag_id);
                  const lens = getLensInfo(tag?.name || m.tag_id, tag?.category);

                  return (
                    <div key={m.tag_id} className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/60 px-2 rounded-xl transition-colors">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{lens.icon}</span>
                        <div>
                          <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            <span>{tag?.name || m.tag_id}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${lens.color}`}>
                              {lens.label}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>Avain: <code className="text-slate-600">{m.tag_id}</code></span>
                            {m.source && (
                              <span className={`px-1.5 py-0.2 rounded font-bold ${
                                m.source === 'MANUAL' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {m.source === 'MANUAL' ? 'Käsin lisätty' : `AI (${m.confidence}%)`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Tier valitsin */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            onClick={() => onAddOrUpdateMapping(activePlace.place_id, m.tag_id, { tier: 'PRIMARY', source: m.source })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              m.tier === 'PRIMARY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="Ensisijainen teema (paikan keskeinen identiteetti)"
                          >
                            <Star size={11} className={m.tier === 'PRIMARY' ? 'fill-current' : ''} />
                            Ensisijainen
                          </button>
                          <button
                            onClick={() => onAddOrUpdateMapping(activePlace.place_id, m.tag_id, { tier: 'SECONDARY', source: m.source })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              m.tier === 'SECONDARY' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="Toissijainen teema (liitännäinen tai sivujuonne)"
                          >
                            <Circle size={10} className={m.tier === 'SECONDARY' ? 'fill-current' : ''} />
                            Toissijainen
                          </button>
                        </div>

                        {/* Poista kytkentä */}
                        <button
                          onClick={() => onRemoveMapping(activePlace.place_id, m.tag_id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={`Irrota teema "${tag?.name || m.tag_id}" tältä paikalta`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Lisää teema paikkaan */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Lisää teema paikkaan:</span>
              <select
                value={selectedNewTagId}
                onChange={e => setSelectedNewTagId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 outline-none flex-1 min-w-[200px]"
              >
                <option value="">-- Valitse lisättävä teema --</option>
                {tags
                  .filter(t => !activeDirectMappings.some(m => m.tag_id === t.tag_id))
                  .map(t => (
                    <option key={t.tag_id} value={t.tag_id}>
                      {t.name} {t.category ? `(${t.category})` : ''}
                    </option>
                  ))}
              </select>

              <select
                value={selectedNewTier}
                onChange={e => setSelectedNewTier(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="PRIMARY">★ Ensisijainen</option>
                <option value="SECONDARY">● Toissijainen</option>
              </select>

              <button
                onClick={handleAdd}
                disabled={!selectedNewTagId || isAdding}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Liitä teema
              </button>
            </div>
          </div>

          {/* 2. Periytyvät teemat (Hierarkiasta laskettu) */}
          <div className="bg-gradient-to-br from-teal-50/60 to-emerald-50/40 border border-teal-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🌿</span>
              <div>
                <h4 className="font-bold text-sm text-teal-950">Alueelta periytyvät teemat (Hierarkia)</h4>
                <p className="text-[11px] text-teal-800">
                  Nämä teemat tulevat ylemmältä tasolta (esim. kunta tai kylä, jossa <code>scope = DESCENDANTS</code>).
                  Niitä ei tallenneta erillisinä riveinä kohteelle, vaan ne periytyvät automaattisesti.
                </p>
              </div>
            </div>

            {activeInheritedMappings.length === 0 ? (
              <p className="text-xs text-slate-500 italic bg-white/70 p-3 rounded-xl border border-teal-100">
                Ei ylemmältä tasolta periytyviä teemoja tälle paikalle.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {activeInheritedMappings.map(im => {
                  const tag = tagMap.get(im.tag_id);
                  const lens = getLensInfo(tag?.name || im.tag_id, tag?.category);
                  return (
                    <div key={im.tag_id} className="bg-white/90 border border-teal-200 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{lens.icon}</span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-900 truncate block">{tag?.name || im.tag_id}</span>
                          <span className="text-[10px] text-teal-700 font-semibold block truncate">
                            Periytyy alueelta: {im.inherited_from_name}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full flex-shrink-0">
                        Peritty
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Valitse paikka listasta tarkastellaksesi teemoja.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. TEEMANÄKYMÄ (🏷️ Teemat)
// ─────────────────────────────────────────────────────────────
interface UnifiedThemeViewProps {
  tags: TagRow[];
  places: PlaceRow[];
  mappings: CanonicalThemeMapping[];
  tagSearch: string;
  setTagSearch: (s: string) => void;
  filterCategory: string;
  setFilterCategory: (s: string) => void;
  categories: string[];
  filterLens: string;
  setFilterLens: (s: any) => void;
  showOnlyActiveTags: boolean;
  setShowOnlyActiveTags: (b: boolean) => void;
  onAddOrUpdateMapping: (place_id: string, tag_id: string, opt?: any) => Promise<void>;
  onRemoveMapping: (place_id: string, tag_id: string) => Promise<void>;
  onDeleteTheme: (tag: TagRow) => Promise<void>;
}

function UnifiedThemeView({
  tags,
  places,
  mappings,
  tagSearch,
  setTagSearch,
  filterCategory,
  setFilterCategory,
  categories,
  filterLens,
  setFilterLens,
  showOnlyActiveTags,
  setShowOnlyActiveTags,
  onAddOrUpdateMapping,
  onRemoveMapping,
  onDeleteTheme
}: UnifiedThemeViewProps) {
  const [selectedTagId, setSelectedTagId] = useState<string | null>(tags[0]?.tag_id || null);
  const [selectedNewPlaceId, setSelectedNewPlaceId] = useState('');
  const [selectedNewTier, setSelectedNewTier] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  const [isAdding, setIsAdding] = useState(false);

  // Mappings per tag
  const tagMappingMap = useMemo(() => {
    const map = new Map<string, CanonicalThemeMapping[]>();
    mappings.forEach(m => {
      const arr = map.get(m.tag_id) || [];
      arr.push(m);
      map.set(m.tag_id, arr);
    });
    return map;
  }, [mappings]);

  const placeMap = useMemo(() => new Map<string, PlaceRow>(places.map(p => [p.place_id, p])), [places]);

  const activeTag = tags.find(t => t.tag_id === selectedTagId) || tags[0] || null;
  const activePlaceMappings = activeTag ? (tagMappingMap.get(activeTag.tag_id) || []) : [];
  const activeLens = activeTag ? getLensInfo(activeTag.name, activeTag.category) : null;

  const handleAdd = async () => {
    if (!activeTag || !selectedNewPlaceId) return;
    setIsAdding(true);
    try {
      await onAddOrUpdateMapping(selectedNewPlaceId, activeTag.tag_id, {
        tier: selectedNewTier,
        source: 'MANUAL',
        review_status: 'APPROVED'
      });
      setSelectedNewPlaceId('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Vasen sarake: Teemalista */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/50">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Etsi teemaa (esim. historia)…"
              value={tagSearch}
              onChange={e => setTagSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="flex gap-1.5">
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none truncate"
            >
              {categories.map(c => (
                <option key={c} value={c}>{c === 'all' ? 'Kaikki kategoriat' : c}</option>
              ))}
            </select>
            <select
              value={filterLens}
              onChange={e => setFilterLens(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">Kaikki linssit</option>
              <option value="PAST">🏛️ Mennyt</option>
              <option value="PRESENT">🌿 Nykyinen</option>
              <option value="FUTURE">🚀 Tuleva</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {tags.map(t => {
            const count = (tagMappingMap.get(t.tag_id) || []).length;
            const isSelected = activeTag?.tag_id === t.tag_id;
            const lens = getLensInfo(t.name, t.category);

            return (
              <button
                key={t.tag_id}
                onClick={() => setSelectedTagId(t.tag_id)}
                className={`w-full text-left p-3 transition-colors flex items-center justify-between ${
                  isSelected ? 'bg-emerald-50/90 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className={`text-xs font-bold truncate flex items-center gap-1.5 ${isSelected ? 'text-emerald-900' : 'text-slate-800'}`}>
                    <span>{lens.icon}</span>
                    <span>{t.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {t.category || 'Muu'} • <code className="text-slate-500">{t.tag_id}</code>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {count === 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">0</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {tags.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-10">Ei teemoja hakuehdoilla.</div>
          )}
        </div>
      </div>

      {/* Oikea sarake: Valitun teeman paikkalista */}
      {activeTag ? (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto p-6 space-y-6">
          {/* Teeman otsikkokortti */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{activeLens?.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">{activeTag.name}</h3>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${activeLens?.color}`}>
                    {activeLens?.label}
                  </span>
                  {activeTag.category && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">
                      {activeTag.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">tag_id: {activeTag.tag_id}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                Liitetyt paikat: <strong className="text-emerald-700">{activePlaceMappings.length}</strong>
              </span>
              <button
                onClick={() => onDeleteTheme(activeTag)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                title="Poista teema kokonaan järjestelmästä"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Liitetyt paikat */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                  Tähän teemaan kuuluvat paikat
                </h4>
                <p className="text-[11px] text-slate-500">
                  Kun lisäät tai poistat paikan täältä, muutos päivittyy heti myös kyseisen paikan omiin tietoihin.
                </p>
              </div>
            </div>

            {activePlaceMappings.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                <Tag size={20} className="mx-auto text-slate-300 mb-1" />
                Tähän teemaan ei ole vielä liitetty yhtään paikkaa. Liitä paikka alta!
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activePlaceMappings.map(m => {
                  const place = placeMap.get(m.place_id);

                  return (
                    <div key={m.place_id} className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/60 px-2 rounded-xl transition-colors">
                      <div className="flex items-center gap-2.5">
                        <MapPin size={18} className="text-emerald-600 flex-shrink-0" />
                        <div>
                          <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            <span>{place?.name || m.place_id}</span>
                            {place?.municipality && (
                              <span className="text-xs text-slate-400 font-normal">({place.municipality})</span>
                            )}
                            {place?.type && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                                {place.type}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>ID: <code className="text-slate-600">{m.place_id}</code></span>
                            {m.source && (
                              <span className={`px-1.5 py-0.2 rounded font-bold ${
                                m.source === 'MANUAL' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {m.source === 'MANUAL' ? 'Käsin liitetty' : `AI (${m.confidence}%)`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Tier valitsin */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            onClick={() => onAddOrUpdateMapping(m.place_id, activeTag.tag_id, { tier: 'PRIMARY', source: m.source })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              m.tier === 'PRIMARY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="Aseta ensisijaiseksi tälle paikalle"
                          >
                            <Star size={11} className={m.tier === 'PRIMARY' ? 'fill-current' : ''} />
                            Ensisijainen
                          </button>
                          <button
                            onClick={() => onAddOrUpdateMapping(m.place_id, activeTag.tag_id, { tier: 'SECONDARY', source: m.source })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              m.tier === 'SECONDARY' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                            title="Aseta toissijaiseksi tälle paikalle"
                          >
                            <Circle size={10} className={m.tier === 'SECONDARY' ? 'fill-current' : ''} />
                            Toissijainen
                          </button>
                        </div>

                        {/* Poista kytkentä */}
                        <button
                          onClick={() => onRemoveMapping(m.place_id, activeTag.tag_id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={`Irrota paikka "${place?.name || m.place_id}" tästä teemasta`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Lisää paikka teemaan */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Lisää paikka teemaan:</span>
              <select
                value={selectedNewPlaceId}
                onChange={e => setSelectedNewPlaceId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 outline-none flex-1 min-w-[200px]"
              >
                <option value="">-- Valitse liitettävä paikka --</option>
                {places
                  .filter(p => !activePlaceMappings.some(m => m.place_id === p.place_id))
                  .map(p => (
                    <option key={p.place_id} value={p.place_id}>
                      {p.name} {p.municipality ? `(${p.municipality})` : ''} {p.type ? `[${p.type}]` : ''}
                    </option>
                  ))}
              </select>

              <select
                value={selectedNewTier}
                onChange={e => setSelectedNewTier(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="PRIMARY">★ Ensisijainen</option>
                <option value="SECONDARY">● Toissijainen</option>
              </select>

              <button
                onClick={handleAdd}
                disabled={!selectedNewPlaceId || isAdding}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Liitä paikka
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Valitse teema listasta tarkastellaksesi paikkoja.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tietokortti-modaalikomponentti (📖 KnowledgeCardModal)
// ─────────────────────────────────────────────────────────────
interface KnowledgeCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (card: Partial<KnowledgeCardPost>, placeId: string, tagId: string) => Promise<void>;
  card: Partial<KnowledgeCardPost> | null;
  places: PlaceRow[];
  tags: TagRow[];
  defaultPlaceId?: string;
  defaultTagId?: string;
}

function KnowledgeCardModal({
  isOpen,
  onClose,
  onSave,
  card,
  places,
  tags,
  defaultPlaceId,
  defaultTagId
}: KnowledgeCardModalProps) {
  const [selectedPlaceId, setSelectedPlaceId] = useState(card?.place_id || defaultPlaceId || places[0]?.place_id || '');
  const [selectedTagId, setSelectedTagId] = useState(card?.tag_ids?.[0] || card?.tags || defaultTagId || tags[0]?.tag_id || '');
  const [title, setTitle] = useState(card?.title || '');
  const [description, setDescription] = useState(card?.description || '');
  const [content, setContent] = useState(card?.content || '');
  const [imageUrl, setImageUrl] = useState(card?.image_url || '');
  const [publisherName, setPublisherName] = useState(card?.publisher_name || 'LaukaaInfo Toimitus');
  const [accessKey, setAccessKey] = useState(card?.access_key || '');
  const [status, setStatus] = useState(card?.status || 'published');
  const [templateType, setTemplateType] = useState(card?.template_type || 'GUIDE');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const generateAccessKey = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'TK-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAccessKey(code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedPlaceId) {
      alert('Täytä vähintään otsikko ja valitse paikka!');
      return;
    }
    setIsSaving(true);
    try {
      await onSave(
        {
          id: card?.id,
          title,
          description,
          content,
          image_url: imageUrl,
          publisher_name: publisherName,
          access_key: accessKey,
          status,
          template_type: templateType
        },
        selectedPlaceId,
        selectedTagId
      );
      onClose();
    } catch (err: any) {
      // virhe käsitelty onSavessa
    } finally {
      setIsSaving(false);
    }
  };

  const publicUrl = card?.id
    ? `tietokortti.html?id=${card.id}`
    : selectedPlaceId && selectedTagId
    ? `tietokortti.html?place=${selectedPlaceId}&theme=${selectedTagId}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                {card?.id ? 'Muokkaa tietokorttia' : 'Luo uusi tietokortti'}
              </h3>
              <p className="text-xs text-slate-500">
                Paikkaan ja teemaan syventyvä pitkäikäinen opas, historia tai artikkeli
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {/* Paikka ja Teema valinta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">📍 Kohde / Paikka *</label>
              <select
                value={selectedPlaceId}
                onChange={e => setSelectedPlaceId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500"
                required
              >
                {places.map(p => (
                  <option key={p.place_id} value={p.place_id}>
                    {p.name} {p.municipality ? `(${p.municipality})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">🏷️ Pääteema / Näkökulma *</label>
              <select
                value={selectedTagId}
                onChange={e => setSelectedTagId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500"
                required
              >
                {tags.map(t => (
                  <option key={t.tag_id} value={t.tag_id}>
                    {t.name} ({t.category || 'Teema'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Otsikko ja Tyyppi */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Otsikko *</label>
              <input
                type="text"
                placeholder="esim. Kirkkoniemen laavu ja retkeilyreitti"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Sisältöpohja</label>
              <select
                value={templateType}
                onChange={e => setTemplateType(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="GUIDE">Opas / Reittiohje</option>
                <option value="HISTORY">Historia / Perintö</option>
                <option value="INTRO">Kohteen esittely</option>
                <option value="STORY">Tarina / Muistelu</option>
              </select>
            </div>
          </div>

          {/* Ingressi / Tiivistelmä */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Ingressi / Tiivistelmä</label>
            <textarea
              rows={2}
              placeholder="Lyhyt 1-2 lauseen johdanto, joka näkyy teemasivun esitteessä ja artikkelin alussa..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Pääkuvan URL ja esikatselu */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Pääkuvan URL (Google Kuvat / Unsplash / verkko-osoite)</label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://..."
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
              />
              {imageUrl && (
                <div className="w-10 h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0">
                  <img src={imageUrl} alt="preview" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                </div>
              )}
            </div>
          </div>

          {/* Varsinainen sisältö (Markdown) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-slate-700">Leipäteksti (Markdown tuettu)</label>
              <span className="text-[10px] text-slate-400">Vinkki: ## Väliotsikko, * lista, &gt; lainaus</span>
            </div>
            <textarea
              rows={8}
              placeholder="Kirjoita kohteen laajempi esittely, saapumisohjeet, palvelut tai historiatausta tähän..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 font-mono text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Julkaisijan nimi ja Koodipääsy / Access Key */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Julkaisija / Lähde</label>
              <input
                type="text"
                placeholder="esim. Laukaan vapaa-aikapalvelut"
                value={publisherName}
                onChange={e => setPublisherName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-slate-700">🔑 Koodipääsy / Muokkausavain</label>
                <button
                  type="button"
                  onClick={generateAccessKey}
                  className="text-[10px] text-amber-700 font-bold hover:underline"
                >
                  Generoi koodi
                </button>
              </div>
              <input
                type="text"
                placeholder="esim. TK-88912A (valinnainen)"
                value={accessKey}
                onChange={e => setAccessKey(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Julkaisun tila */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Julkaisun tila:</span>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold bg-white outline-none"
              >
                <option value="published">🟢 Julkaistu (näkyy heti)</option>
                <option value="draft">🟡 Luonnos (vain ylläpito)</option>
              </select>
            </div>

            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 font-bold text-xs"
              >
                <ExternalLink size={12} /> Esikatsele tietokortti.html
              </a>
            )}
          </div>

          {/* Napit */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              Peruuta
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
              {card?.id ? 'Tallenna muutokset' : 'Tallenna ja julkaise'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. MATRIISINÄKYMÄ (📊 Matriisi)
// ─────────────────────────────────────────────────────────────
interface UnifiedMatrixViewProps {
  places: PlaceRow[];
  tags: TagRow[];
  mappings: CanonicalThemeMapping[];
  inheritedMappings: InheritedThemeMapping[];
  knowledgeCards: KnowledgeCardPost[];
  onOpenKnowledgeCard: (placeId: string, tagId: string, card?: KnowledgeCardPost) => void;
  filterCardCoverage: string;
  setFilterCardCoverage: (s: any) => void;
  placeSearch: string;
  setPlaceSearch: (s: string) => void;
  tagSearch: string;
  setTagSearch: (s: string) => void;
  filterCategory: string;
  setFilterCategory: (s: string) => void;
  categories: string[];
  filterLens: string;
  setFilterLens: (s: any) => void;
  filterCoverage: string;
  setFilterCoverage: (s: string) => void;
  showOnlyActiveTags: boolean;
  setShowOnlyActiveTags: (b: boolean) => void;
  maxPlaces: number;
  setMaxPlaces: (n: number) => void;
  maxTags: number;
  setMaxTags: (n: number) => void;
  onAddOrUpdateMapping: (place_id: string, tag_id: string, opt?: any) => Promise<void>;
  onRemoveMapping: (place_id: string, tag_id: string) => Promise<void>;
}

function UnifiedMatrixView({
  places,
  tags,
  mappings,
  inheritedMappings,
  knowledgeCards,
  onOpenKnowledgeCard,
  filterCardCoverage,
  setFilterCardCoverage,
  placeSearch,
  setPlaceSearch,
  tagSearch,
  setTagSearch,
  filterCategory,
  setFilterCategory,
  categories,
  filterLens,
  setFilterLens,
  filterCoverage,
  setFilterCoverage,
  showOnlyActiveTags,
  setShowOnlyActiveTags,
  maxPlaces,
  setMaxPlaces,
  maxTags,
  setMaxTags,
  onAddOrUpdateMapping,
  onRemoveMapping
}: UnifiedMatrixViewProps) {
  // Mapping lookup: key -> mapping
  const mappingMap = useMemo(() => {
    const map = new Map<string, CanonicalThemeMapping>();
    mappings.forEach(m => map.set(`${m.place_id}::${m.tag_id}`, m));
    return map;
  }, [mappings]);

  const inheritedSet = useMemo(() => {
    const set = new Set<string>();
    inheritedMappings.forEach(im => set.add(`${im.place_id}::${im.tag_id}`));
    return set;
  }, [inheritedMappings]);

  const displayedPlaces = useMemo(() => {
    if (filterCardCoverage === 'has_card') {
      const placesWithCards = new Set(knowledgeCards.map(c => c.place_id));
      return places.filter(p => placesWithCards.has(p.place_id));
    }
    if (filterCardCoverage === 'missing_card') {
      return places.filter(p => {
        const placeMappings = mappings.filter(m => m.place_id === p.place_id && m.tier === 'PRIMARY');
        return placeMappings.some(m => !knowledgeCards.some(c => c.place_id === p.place_id && (c.tag_ids?.includes(m.tag_id) || c.tags === m.tag_id)));
      });
    }
    return places;
  }, [places, filterCardCoverage, knowledgeCards, mappings]);

  const getDirectCount = (placeId: string) => mappings.filter(m => m.place_id === placeId).length;

  const handleCellClick = (placeId: string, tagId: string) => {
    const key = `${placeId}::${tagId}`;
    const existing = mappingMap.get(key);

    if (!existing) {
      // Ei kytkentää -> luodaan PRIMARY (Ensisijainen)
      onAddOrUpdateMapping(placeId, tagId, { tier: 'PRIMARY', source: 'MANUAL', review_status: 'APPROVED' });
    } else if (existing.tier === 'PRIMARY') {
      // PRIMARY -> vaihdetaan SECONDARY
      onAddOrUpdateMapping(placeId, tagId, { tier: 'SECONDARY', source: existing.source });
    } else {
      // SECONDARY -> poistetaan kokonaan
      onRemoveMapping(placeId, tagId);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Työkalurivi */}
      <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-slate-200 bg-white items-center">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Hae paikkaa…"
            value={placeSearch}
            onChange={e => setPlaceSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 w-44 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Hae teemaa…"
            value={tagSearch}
            onChange={e => setTagSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 w-44 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 outline-none"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'Kaikki kategoriat' : c}</option>
          ))}
        </select>
        <select
          value={filterLens}
          onChange={e => setFilterLens(e.target.value)}
          className="px-2 py-1.5 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold bg-indigo-50/50 outline-none"
        >
          <option value="all">Kaikki linssit</option>
          <option value="PAST">🏛️ Mennyt (Historia/Muisti)</option>
          <option value="PRESENT">🌿 Nykyinen (Kokemus/Toiminta)</option>
          <option value="FUTURE">🚀 Tuleva (Kiertotalous/Visio)</option>
        </select>
        <select
          value={filterCoverage}
          onChange={e => setFilterCoverage(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 outline-none"
        >
          <option value="all">Kaikki paikat</option>
          <option value="missing">Ilman suoraa teemaa</option>
          <option value="covered">Teemoitetut paikat</option>
        </select>
        <select
          value={filterCardCoverage}
          onChange={e => setFilterCardCoverage(e.target.value)}
          className="px-2 py-1.5 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold bg-amber-50/70 outline-none"
        >
          <option value="all">Kaikki tietosisällöt</option>
          <option value="has_card">📄 Vain paikat joilla tietokortti ({knowledgeCards.length})</option>
          <option value="missing_card">⚠️ Sisältövaje (★ ilman tietokorttia)</option>
        </select>

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span>Paikat:</span>
          <select
            value={maxPlaces}
            onChange={e => setMaxPlaces(Number(e.target.value))}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold bg-slate-50 outline-none"
          >
            {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>Teemat:</span>
          <select
            value={maxTags}
            onChange={e => setMaxTags(Number(e.target.value))}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold bg-slate-50 outline-none"
          >
            {[15, 30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Matriisitaulukko */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {displayedPlaces.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Ei paikkoja suodatusehdoilla.</div>
        ) : (
          <table className="border-collapse text-[11px]" style={{ minWidth: `${160 + tags.length * 36}px` }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-white border border-slate-200 px-3 py-2 text-left font-black text-slate-600 whitespace-nowrap min-w-[180px]">
                  Paikka / Teema
                </th>
                <th className="border border-slate-200 px-2 py-2 font-black text-center text-slate-500 bg-slate-50 w-12">
                  Lkm
                </th>
                {tags.map(t => {
                  const lens = getLensInfo(t.name, t.category);
                  return (
                    <th
                      key={t.tag_id}
                      className="border border-slate-200 w-9 bg-emerald-50/60"
                      title={`${lens.icon} [${lens.label}] ${t.name} (${t.places_count || 0} paikkaa)`}
                      style={{ minWidth: 36, maxWidth: 36 }}
                    >
                      <div
                        className="text-[9px] font-bold text-emerald-900"
                        style={{
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          padding: '6px 4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxHeight: 130
                        }}
                      >
                        <span className="text-[10px] mr-1">{lens.icon}</span>
                        {t.name}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayedPlaces.map(p => {
                const count = getDirectCount(p.place_id);
                return (
                  <tr key={p.place_id} className="hover:bg-emerald-50/40 transition-colors group">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-emerald-50/40 border border-slate-200 px-3 py-1.5 font-semibold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[200px]" title={p.name}>{p.name}</span>
                        {p.municipality && <span className="text-[9px] text-slate-400 font-normal">({p.municipality})</span>}
                      </div>
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center bg-slate-50/40">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                        count === 0 ? 'bg-red-100 text-red-700' : count < 3 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {count}
                      </span>
                    </td>
                    {tags.map(t => {
                      const key = `${p.place_id}::${t.tag_id}`;
                      const direct = mappingMap.get(key);
                      const isInherited = !direct && inheritedSet.has(key);
                      const cellCards = knowledgeCards.filter(c =>
                        c.place_id === p.place_id && (c.tag_ids?.includes(t.tag_id) || c.tags === t.tag_id)
                      );
                      const card = cellCards[0];

                      return (
                        <td
                          key={t.tag_id}
                          onClick={() => handleCellClick(p.place_id, t.tag_id)}
                          className={`border border-slate-200 text-center cursor-pointer transition-colors select-none ${
                            direct?.tier === 'PRIMARY'
                              ? 'bg-emerald-100/80 hover:bg-emerald-200 text-emerald-900 font-bold'
                              : direct?.tier === 'SECONDARY'
                              ? 'bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold'
                              : isInherited
                              ? 'bg-teal-50/60 hover:bg-emerald-100 text-teal-700'
                              : 'hover:bg-emerald-100/60 text-slate-300'
                          }`}
                          style={{ width: 36, minWidth: 36, maxWidth: 36 }}
                          title={
                            card
                              ? `📖 Tietokortti: "${card.title}"\nTekijä: ${card.publisher_name || 'Toimitus'}\nKlikkaa 📄-ikonia muokataksesi tietokorttia.`
                              : direct
                              ? `${p.name} × ${t.name}: ${direct.tier === 'PRIMARY' ? '★ Ensisijainen' : '● Toissijainen'} (${direct.source})\nKlikkaa vaihtaaksesi tasoa tai poistaaksesi.`
                              : isInherited
                              ? `${p.name} × ${t.name}: 🌿 Periytyy alueelta!\nKlikkaa asettaaksesi paikkakohtaiseksi suoraksi teemaksi.`
                              : `${p.name} + ${t.name}: Ei kytkentää.\nKlikkaa lisätäksesi ensisijaiseksi.`
                          }
                        >
                          <div className="relative group/cell flex items-center justify-center">
                            {direct?.tier === 'PRIMARY' ? (
                              <span className="text-emerald-700 font-black text-xs">★</span>
                            ) : direct?.tier === 'SECONDARY' ? (
                              <span className="text-blue-600 font-black text-xs">●</span>
                            ) : isInherited ? (
                              <span className="text-teal-600 font-bold text-[11px]">🌿</span>
                            ) : (
                              <span className="text-slate-300 text-xs">·</span>
                            )}

                            {card && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenKnowledgeCard(p.place_id, t.tag_id, card);
                                }}
                                className="ml-0.5 text-[10px] hover:scale-125 transition-transform"
                                title={`📖 Muokkaa tietokorttia: "${card.title}"`}
                              >
                                📄
                              </button>
                            )}

                            {!card && direct?.tier === 'PRIMARY' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenKnowledgeCard(p.place_id, t.tag_id);
                                }}
                                className="hidden group-hover/cell:inline-flex absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black items-center justify-center shadow-xs"
                                title={`Kirjoita tietokortti: ${p.name} × ${t.name}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Selite ja tilastot alatunnisteessa */}
      <div className="border-t border-slate-200 px-6 py-2 bg-slate-50 flex items-center gap-4 text-[11px] text-slate-600 flex-wrap">
        <span className="flex items-center gap-1 font-semibold">
          <span className="text-emerald-700 font-black">★</span> Ensisijainen (PRIMARY)
        </span>
        <span className="flex items-center gap-1 font-semibold">
          <span className="text-blue-600 font-black">●</span> Toissijainen (SECONDARY)
        </span>
        <span className="flex items-center gap-1 font-semibold">
          <span className="text-teal-600">🌿</span> Periytyvä alueelta
        </span>
        <span className="flex items-center gap-1">
          <span className="text-slate-300 font-black">·</span> Ei kytkentää
        </span>
        <span className="flex items-center gap-1 font-semibold text-amber-800">
          <span>📄</span> Tietokortti julkaistu (klikkaa muokataksesi)
        </span>
        <span className="text-slate-400 ml-auto">
          Klikkaussykli solussa: <em>Lisää ensisijainen (★) → Vaihda toissijaiseksi (●) → Poista (·)</em>
        </span>
      </div>
    </div>
  );
}

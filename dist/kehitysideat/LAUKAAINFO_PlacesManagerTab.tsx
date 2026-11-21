import React, { useState, useEffect, useCallback } from 'react';
import { ThemesManagerView } from './ThemesManagerView';
import {
  Search, Plus, MapPin, CheckCircle, Store, Link2, Sparkles,
  Building, TreePine, Map, Activity, Eye, Loader2, Copy,
  ChevronRight, CheckSquare, X, AlertCircle, Edit2, Save, Trash2, Layers, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { CompanyProfile, PLACE_TYPES } from '../types';
import { PlaceSourcesEditor } from './PlaceSourcesEditor';
import { PlaceContentEditor } from './PlaceContentEditor';
import { PlaceSuggestionsManager } from './PlaceSuggestionsManager';
import { AreaHierarchyDialog } from './AreaHierarchyDialog';
import { PlaceMemoriesTab } from './PlaceMemoriesTab';
import { PlaceBulkTab } from './PlaceBulkTab';
import { ThemeImagesManager } from './ThemeImagesManager';
import { CoordinateMapPicker } from './CoordinateMapPicker';
import EntityTagsEditor from './EntityTagsEditor';
import { PlaceMediaEditor } from './PlaceMediaEditor';
import { PlaceThemesEditor } from './PlaceThemesEditor';
import { calculateQualityScore, analyzePlaceCleanup } from '../utils/qualityScorer';

// ─── Tyypit ──────────────────────────────────────────────────────────────────

interface PlaceRelation {
  id: string;
  entity_id: string;
  entity_type: string;
  relation_type: string;
  relation_context: string;
  strength: string;
}

interface RelationType {
  code: string;
  name_fi: string;
  description: string;
  sort_order: number;
}

interface EntityType {
  code: string;
  name_fi: string;
}


interface Place {
  id: string;
  place_id: string;
  name: string;
  canonical_name: string;
  type: string;
  place_type?: string;
  municipality: string;
  status: string;
  tier?: string;
  verified: boolean;
  importance: number;
  commercial_visibility: boolean;
  description?: string;
  lat?: number;
  lon?: number;
  geometry_type?: string;
  recognition_zone?: number;
  parent_place_id?: string;
  mixonet_place_id?: string | null;
  place_level?: string;
  is_visibility_target?: boolean;
  show_in_main_list?: boolean;
  quality_score?: number;
}

interface SuggestedRelation {
  place_id: string;
  place_name: string;
  context: string;
  confidence: number;
}

interface SuggestedNewPlace {
  name: string;
  type: string;
  municipality: string;
  reason: string;
  description?: string;
  lat?: number;
  lon?: number;
}

interface AiResponse {
  suggested_relations: SuggestedRelation[];
  suggested_new_places: SuggestedNewPlace[];
}

interface PlacesManagerTabProps {
  profiles: CompanyProfile[];
}

// ─── Apufunktiot ─────────────────────────────────────────────────────────────

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'NATURE': return <TreePine className="w-4 h-4 text-green-600" />;
    case 'CAMPFIRE_SHELTER': return <span className="text-sm">🔥</span>;
    case 'VIEWPOINT': return <span className="text-sm">👁️</span>;
    case 'BEACH': return <span className="text-sm">🏖️</span>;
    case 'SERVICE': return <Store className="w-4 h-4 text-blue-600" />;
    case 'BUILDING': return <Building className="w-4 h-4 text-slate-600" />;
    case 'LANDMARK': return <MapPin className="w-4 h-4 text-purple-600" />;
    case 'ROUTE': return <span className="text-sm">🥾</span>;
    case 'HISTORICAL_SITE': return <span className="text-sm">📜</span>;
    case 'LIBRARY': return <span className="text-sm">📚</span>;
    case 'PARK': return <span className="text-sm">🌳</span>;
    default: return <Map className="w-4 h-4 text-gray-600" />;
  }
};

const confidenceColor = (c: number) => {
  if (c >= 85) return 'bg-green-100 text-green-800 border-green-200';
  if (c >= 65) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const getPlaceHierarchyChain = (place: Place, allPlaces: Place[]): Place[] => {
  const chain: Place[] = [];
  let current: Place | undefined = place;
  const visited = new Set<string>();

  while (current && current.parent_place_id && !visited.has(current.parent_place_id)) {
    visited.add(current.place_id);
    const parent = allPlaces.find(p => p.place_id === current!.parent_place_id);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
};

// ─── Pääkomponentti ──────────────────────────────────────────────────────────

export const PlacesManagerTab: React.FC<PlacesManagerTabProps> = ({ profiles }) => {
  const [activeView, setActiveView] = useState<'places' | 'ai' | 'suggestions' | 'memories' | 'bulk' | 'themes' | 'theme-images'>('places');

  // Paikkalista-tila
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT' | 'DISCOVERED' | 'ARCHIVED'>('PUBLISHED');
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [placeCompanyCount, setPlaceCompanyCount] = useState<Record<string, number>>({});

  // AI-Yhdistäminen-tila
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanyProfile | null>(null);
  const [promptText, setPromptText] = useState('');
  const [jsonResponse, setJsonResponse] = useState('');
  const [parsedResponse, setParsedResponse] = useState<AiResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState<Set<number>>(new Set());
  const [savedNew, setSavedNew] = useState<Set<number>>(new Set());
  const [savingRel, setSavingRel] = useState<Set<number>>(new Set());
  const [savedRel, setSavedRel] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [activeRelations, setActiveRelations] = useState<PlaceRelation[]>([]);
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [selectedCompanyToAdd, setSelectedCompanyToAdd] = useState<CompanyProfile | null>(null);
  const [newRelationType, setNewRelationType] = useState('SERVICE_AREA');
  const [newRelationContext, setNewRelationContext] = useState('');
  const [newRelationStrength, setNewRelationStrength] = useState('SECONDARY');
  const [canonicalDuplicate, setCanonicalDuplicate] = useState<string | null>(null);
  const [linkedEntities, setLinkedEntities] = useState<any[]>([]);
  const [parentPlaceSearch, setParentPlaceSearch] = useState(''); // Yläpaikan hakusuodatin
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false); // Edistyneet tekniset asetukset haitari

  // ── Alueen hierarkia -dialogi ──────────────────────────────────────────────
  const [areaHierarchyDialogPlace, setAreaHierarchyDialogPlace] = useState<Place | null>(null);

  // DB-tyypit
  const [dbRelationTypes, setDbRelationTypes] = useState<RelationType[]>([]);
  const [dbEntityTypes, setDbEntityTypes] = useState<EntityType[]>([]);

  // ── Hae DB-tyypit ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const [relRes, entRes] = await Promise.all([
          supabase.from('relation_types').select('*').order('sort_order', { ascending: true }),
          supabase.from('entity_types').select('*')
        ]);
        if (relRes.data) setDbRelationTypes(relRes.data);
        if (entRes.data) setDbEntityTypes(entRes.data);
      } catch (e) {
        console.error('Error fetching DB types', e);
      }
    };
    fetchTypes();
  }, []);


  
  
  const fetchActivePlaceRelations = async (placeId: string) => {
    try {
      const { data, error } = await supabase
        .from('place_relations')
        .select('id, entity_id, entity_type, entity_name, relation_type, relation_context, strength')
        .eq('place_id', placeId);
      if (error) throw error;
      setActiveRelations(data || []);
    } catch (err) {
      console.error('Error fetching relations:', err);
    }
  };

  const removeRelation = async (relationId: string) => {
    if (!confirm('Haluatko varmasti poistaa tämän yhteyden?')) return;
    try {
      const { error } = await supabase.from('place_relations').delete().eq('id', relationId);
      if (error) throw error;
      setActiveRelations(prev => prev.filter(r => r.id !== relationId));
      fetchCompanyCount(); // Päivittää lukumäärät
    } catch (err: any) {
      alert('Virhe poistossa: ' + err.message);
    }
  };

  const addRelation = async () => {
    if (!selectedCompanyToAdd || !editingPlace) return;
    try {
      const { data, error } = await supabase.from('place_relations').insert({
        place_id: editingPlace.place_id,
        entity_id: selectedCompanyToAdd.id,
        entity_type: 'COMPANY',
        entity_name: selectedCompanyToAdd.name,
        relation_type: newRelationType,
        relation_context: newRelationContext || 'Lisätty käsin',
        strength: newRelationStrength
      }).select();
      
      if (error) throw error;
      if (data && data.length > 0) {
        setActiveRelations(prev => [...prev, data[0]]);
      }
      setSelectedCompanyToAdd(null);
      setCompanySearchTerm('');
      setNewRelationContext('');
      setNewRelationType('SERVICE_AREA');
      setNewRelationStrength('SECONDARY');
      fetchCompanyCount();
    } catch (err: any) {
      alert('Virhe lisäyksessä: ' + err.message);
    }
  };

  useEffect(() => {
    if (editingPlace) {
      fetchActivePlaceRelations(editingPlace.place_id);
      // Hae JSON-kohdekortit ja suodata paikan mukaan
      fetch('/api/entities')
        .then(r => r.json())
        .then(data => {
          const arr = Array.isArray(data) ? data : [];
          setLinkedEntities(arr.filter((e: any) => e.place_id === editingPlace.place_id));
        })
        .catch(() => setLinkedEntities([]));
    } else {
      setActiveRelations([]);
      setCompanySearchTerm('');
      setSelectedCompanyToAdd(null);
      setLinkedEntities([]);
    }
  }, [editingPlace]);

  // ── Canonical-nimen duplikaattitarkistus ───────────────────────────────────
  // Tarkistaa onko canonical_name jo käytössä ja palauttaa uniikin version.
  // Ehdottaa: 1) nimi + kunta, 2) nimi + kunta + juokseva numero
  const resolveUniqueCanonicalName = (
    candidate: string,
    municipality: string,
    excludePlaceId?: string // ohitetaan muokattava paikka itse
  ): { unique: string; wasModified: boolean } => {
    const existing = places
      .filter(p => p.place_id !== excludePlaceId)
      .map(p => (p.canonical_name || '').toLowerCase().trim());

    const base = (candidate ?? '').trim();
    if (!existing.includes(base.toLowerCase())) {
      return { unique: base, wasModified: false };
    }

    // Yritys 1: nimi + kunta
    const withMuni = `${base} (${municipality})`;
    if (!existing.includes(withMuni.toLowerCase())) {
      return { unique: withMuni, wasModified: true };
    }

    // Yritys 2: nimi + kunta + numero
    for (let i = 2; i <= 20; i++) {
      const withNum = `${base} (${municipality} ${i})`;
      if (!existing.includes(withNum.toLowerCase())) {
        return { unique: withNum, wasModified: true };
      }
    }

    return { unique: base, wasModified: false }; // fallback
  };

  // ── Poista paikka ─────────────────────────────────────────────────
  const deletePlace = async (place: Place) => {
    const confirmed = window.confirm(
      `Haluatko varmasti poistaa paikan "${place.name || place.canonical_name}"?\n\n` +
      `Tämä poistaa paikan tietokannasta pysyvästi. Place_id: ${place.place_id}`
    );
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from('places')
        .update({ status: 'deleted' })
        .eq('id', place.id);
      if (error) throw error;
      setPlaces(prev => prev.filter(p => p.place_id !== place.place_id));
      setSelectedPlaceId(null);
      setEditingPlace(null);
      setCanonicalDuplicate(null);
    } catch (err: any) {
      alert('Virhe poistossa: ' + err.message);
    }
  };

  const savePlaceEdits = async (updatedPlace: Place) => {
    if (!updatedPlace.name || updatedPlace.name.trim() === '') {
      alert('Paikan nimi on pakollinen!');
      return;
    }
    const score = calculateQualityScore(updatedPlace);
    const placeToSave = { ...updatedPlace, quality_score: score };

    try {
      if (!placeToSave.id) {
        // Uusi paikka - tarkista canonical-duplikaatti
        const { unique, wasModified } = resolveUniqueCanonicalName(
          placeToSave.canonical_name || placeToSave.name || 'paikka',
          placeToSave.municipality || 'laukaa'
        );
        if (wasModified) {
          const ok = window.confirm(
            `Canonical-nimi "${placeToSave.canonical_name}" on jo käytössä.\n\n` +
            `Ehdotettu uniikki nimi: "${unique}"\n\nHyväksy ehdotus?`
          );
          if (!ok) return; // käyttäjä peruutti
          placeToSave.canonical_name = unique;
        }

        const newId = (placeToSave.id && placeToSave.id.trim()) ? placeToSave.id : crypto.randomUUID();
        const { data, error } = await supabase.from('places')
          .insert({
            id: newId,
            name: placeToSave.name,
            canonical_name: placeToSave.canonical_name,
            type: placeToSave.type,
            municipality: placeToSave.municipality,
            description: placeToSave.description,
            lat: placeToSave.lat || null,
            lon: placeToSave.lon || null,
            parent_place_id: placeToSave.parent_place_id || null,
            mixonet_place_id: placeToSave.mixonet_place_id || null,
            place_type: placeToSave.place_type || 'KOHDE',
            is_visibility_target: placeToSave.is_visibility_target || false,
            commercial_visibility: placeToSave.commercial_visibility || false,
            status: placeToSave.status || 'PUBLISHED',
            tier: placeToSave.tier || (placeToSave.parent_place_id ? 'SUB_PLACE' : 'PRIMARY'),
            show_in_main_list: placeToSave.show_in_main_list ?? (placeToSave.status === 'PUBLISHED'),
            quality_score: score,
            verified: false,
            importance: placeToSave.importance || 2,
          }).select().single();
        if (error) throw error;
        // DB generoi place_id automaattisesti – luetaan se paluudatasta
        const mapped: Place = {
          ...data,
          id: data.place_id || data.id,
          commercial_visibility: data.commercial_visibility ?? false,
        };
        setPlaces(prev => [mapped, ...prev]);
        setEditingPlace(null);
        setCanonicalDuplicate(null);
      } else {
        // Päivitys - tarkista duplikaatti (ohittaen oman place_id:n)
        const { unique, wasModified } = resolveUniqueCanonicalName(
          placeToSave.canonical_name || placeToSave.name || 'paikka',
          placeToSave.municipality || 'laukaa',
          placeToSave.place_id
        );
        if (wasModified) {
          const ok = window.confirm(
            `Canonical-nimi "${placeToSave.canonical_name}" on jo käytössä.\n\n` +
            `Ehdotettu uniikki nimi: "${unique}"\n\nHyväksy ehdotus?`
          );
          if (!ok) return;
          placeToSave.canonical_name = unique;
        }

        const { error } = await supabase.from('places')
          .update({
            name: placeToSave.name,
            canonical_name: placeToSave.canonical_name,
            type: placeToSave.type,
            municipality: placeToSave.municipality,
            description: placeToSave.description,
            lat: placeToSave.lat || null,
            lon: placeToSave.lon || null,
            parent_place_id: placeToSave.parent_place_id || null,
            mixonet_place_id: placeToSave.mixonet_place_id || null,
            place_type: placeToSave.place_type || 'KOHDE',
            is_visibility_target: placeToSave.is_visibility_target || false,
            commercial_visibility: placeToSave.commercial_visibility || false,
            status: placeToSave.status || 'PUBLISHED',
            tier: placeToSave.tier || (placeToSave.parent_place_id ? 'SUB_PLACE' : 'PRIMARY'),
            show_in_main_list: placeToSave.show_in_main_list ?? (placeToSave.status === 'PUBLISHED'),
            quality_score: score,
            importance: placeToSave.importance || 2,
          })
          .eq('place_id', placeToSave.place_id);

        if (error) {
          console.error('Supabase update error:', error);
          throw error;
        }
        setPlaces(prev => prev.map(p => p.id === placeToSave.id ? placeToSave : p));
        setEditingPlace(null);
        setCanonicalDuplicate(null);
      }
    } catch (err: any) {
      alert('Virhe päivityksessä: ' + err.message);
    }
  };

  // ── Kuratointitoiminnot löydetyille/pienpaikoille ─────────────────────────────
  const promoteToPublished = async (place: Place) => {
    try {
      const score = calculateQualityScore({ ...place, status: 'PUBLISHED' });
      const { error } = await supabase.from('places').update({
        status: 'PUBLISHED',
        show_in_main_list: true,
        quality_score: score,
      }).eq('place_id', place.place_id);
      if (error) throw error;
      setPlaces(prev => prev.map(p => p.place_id === place.place_id ? { ...p, status: 'PUBLISHED', show_in_main_list: true, quality_score: score } : p));
    } catch (err: any) {
      alert('Virhe julkaisussa: ' + err.message);
    }
  };

  const linkAsSubPlace = async (place: Place, parentPlaceId: string) => {
    try {
      const score = calculateQualityScore({ ...place, status: 'PUBLISHED', tier: 'SUB_PLACE', parent_place_id: parentPlaceId });
      const { error } = await supabase.from('places').update({
        status: 'PUBLISHED',
        tier: 'SUB_PLACE',
        parent_place_id: parentPlaceId,
        show_in_main_list: false,
        quality_score: score,
      }).eq('place_id', place.place_id);
      if (error) throw error;
      setPlaces(prev => prev.map(p => p.place_id === place.place_id ? { ...p, status: 'PUBLISHED', tier: 'SUB_PLACE', parent_place_id: parentPlaceId, show_in_main_list: false, quality_score: score } : p));
    } catch (err: any) {
      alert('Virhe alipaikaksi kytkemisessä: ' + err.message);
    }
  };

  const archivePlace = async (place: Place) => {
    try {
      const { error } = await supabase.from('places').update({
        status: 'ARCHIVED',
        show_in_main_list: false,
      }).eq('place_id', place.place_id);
      if (error) throw error;
      setPlaces(prev => prev.map(p => p.place_id === place.place_id ? { ...p, status: 'ARCHIVED', show_in_main_list: false } : p));
    } catch (err: any) {
      alert('Virhe arkistoinnissa: ' + err.message);
    }
  };

  // ── Hae paikat Supabasesta ─────────────────────────────────────────────────
  const fetchPlaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('places')
        .select('place_id, name, canonical_name, type, place_type, municipality, status, verified, importance, commercial_visibility, description, lat, lon, place_level, parent_place_id, mixonet_place_id, is_visibility_target, tier, show_in_main_list, quality_score')
        .neq('status', 'deleted')
        .order('importance', { ascending: false });
      if (error) throw error;
      const mapped: Place[] = (data || []).map((p: any) => ({
        ...p,
        id: p.place_id,
        status: p.status || 'PUBLISHED',
        tier: p.tier || 'PRIMARY',
        show_in_main_list: p.show_in_main_list ?? true,
        quality_score: p.quality_score ?? 0,
        commercial_visibility: p.commercial_visibility ?? false
      }));
      setPlaces(mapped);
    } catch (err) {
      console.error('Error fetching places:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlaces(); }, [fetchPlaces]);

  const fetchCompanyCount = useCallback(async () => {
    if (places.length === 0) return;
    try {
      const placeIds = places.map(p => p.place_id);
      const { data, error } = await supabase
        .from('place_relations')
        .select('place_id')
        .in('place_id', placeIds)
        .eq('entity_type', 'COMPANY');
      if (error) {
        console.error('Supabase error fetching counts:', error);
        return;
      }
      if (!data) return;
      const counts: Record<string, number> = {};
      data.forEach(r => {
        counts[r.place_id] = (counts[r.place_id] || 0) + 1;
      });
      setPlaceCompanyCount(counts);
    } catch (err) {
      console.error('Error fetching company counts:', err);
    }
  }, [places]);

  // Haetaan luvut aina kun paikkalista päivittyy tai näkymä vaihtuu 'places'-tilaan
  useEffect(() => {
    if (activeView === 'places') {
      fetchCompanyCount();
    }
  }, [activeView, fetchCompanyCount]);

  // ── Nollataan vastauskenttä vain kun yritys VAIHTUU
  useEffect(() => {
    setJsonResponse('');
    setParsedResponse(null);
    setParseError(null);
    setSavedNew(new Set());
    setSavedRel(new Set());
  }, [selectedCompany]);

  // Generoidaan prompt kun yritys tai paikkalista muuttuu
  useEffect(() => {
    if (!selectedCompany || places.length === 0) return;

    const companyDesc = selectedCompany.categories?.core?.description || 'Ei kuvausta';
    const website = selectedCompany.categories?.core?.website || '–';
    const tags = selectedCompany.core?.sub_contexts
      ? (Array.isArray(selectedCompany.core.sub_contexts)
          ? selectedCompany.core.sub_contexts.join(', ')
          : Object.values(selectedCompany.core.sub_contexts).flat().join(', '))
      : '–';

    // Priorisoidaan: ensin saman kunnan paikat, sitten muut – max 120 paikkaa
    const companyMunicipality = (selectedCompany.municipality || 'laukaa').toLowerCase();
    const sortedPlaces = [
      ...places.filter(p => (p.municipality || '').toLowerCase() === companyMunicipality),
      ...places.filter(p => (p.municipality || '').toLowerCase() !== companyMunicipality),
    ].slice(0, 120);

    const placeList = sortedPlaces.map(p => {
      const desc = p.description ? ` | ${p.description.slice(0, 80).replace(/\n/g, ' ')}…` : '';
      const coords = (p.lat && p.lon) ? ` | lat:${p.lat.toFixed(4)},lon:${p.lon.toFixed(4)}` : '';
      return `- ${p.place_id} | "${p.canonical_name || p.name}" | ${p.type} | ${p.municipality}${coords}${desc}`;
    }).join('\n');

    const prompt = `# LaukaaInfo – Paikkaverkko-analyysi

## Analysoitava yritys
Nimi: ${selectedCompany.name}
Kuvaus: ${companyDesc}
Verkkosivut: ${website}
Avainsanat / sub_contexts: ${tags}
Kunta: Laukaa

## Tietokannassa olevat paikat (id | nimi | tyyppi | kunta)
${placeList}

## Tehtäväsi

1. Analysoi yllä olevat paikkaverkon paikat.
2. Valitse mihin paikkoihin tämä yritys liittyy ja miksi (ns. "context" eli syy liittymiselle).
3. Jos listasta puuttuu jokin paikka, johon yritys selvästi liittyy, ehdota sitä "suggested_new_places"-osiossa.

## Vastausmuoto (VAIN JSON, ei selitystekstejä)

{
  "suggested_relations": [
    { "place_id": "UUID-tähän", "place_name": "Paikan nimi", "context": "Lyhyt syy esim. Tapahtumakuvaus", "confidence": 92 }
  ],
  "suggested_new_places": [
    { "name": "Uuden paikan nimi", "type": "NATURE|LANDMARK|SERVICE|BUILDING|AREA|ROUTE", "municipality": "Laukaa", "reason": "Miksi tämä paikka pitäisi lisätä", "description": "Lyhyt, myyvä ja houkutteleva asiakaskuvaus paikasta (2-3 lausetta)" }
  ]
}`;

    setPromptText(prompt);
  }, [selectedCompany, places]);

  // ── Parsitaan AI:n JSON-vastaus ────────────────────────────────────────────
  const parseJson = () => {
    setParseError(null);
    try {
      // Leikkaa mahdolliset ```json ... ``` lohkot
      const cleaned = jsonResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed: AiResponse = JSON.parse(cleaned);
      if (!parsed.suggested_relations || !parsed.suggested_new_places) {
        throw new Error('JSON puuttuu kenttiä: suggested_relations tai suggested_new_places');
      }
      setParsedResponse(parsed);
    } catch (e: any) {
      setParseError(e.message);
    }
  };

  // ── Tallenna yhteys Supabaseen ──────────────────────────────────────────────
  const saveRelation = async (rel: SuggestedRelation, idx: number) => {
    if (!selectedCompany) return;
    setSavingRel(prev => new Set(prev).add(idx));
    try {
      const { data, error } = await supabase.from('place_relations').insert({
        place_id: rel.place_id,
        entity_id: selectedCompany.id,
        entity_type: 'COMPANY',
        relation_type: 'OTHER',
        relation_context: rel.context,
        strength: 'SECONDARY'
      }).select();
      
      if (error) {
        console.error('Supabase insert error (place_relations):', error);
        throw error;
      }
      console.log('Saved relation:', data);
      
      setSavedRel(prev => new Set(prev).add(idx));
      // Päivitetään paikallinen yrityslukema heti
      setPlaceCompanyCount(prev => ({
        ...prev,
        [rel.place_id]: (prev[rel.place_id] || 0) + 1
      }));
    } catch (err: any) {
      console.error('Save relation error:', err);
      alert('Virhe yhteyden tallennuksessa: ' + err.message);
    } finally {
      setSavingRel(prev => { const s = new Set(prev); s.delete(idx); return s; });
    }
  };

  // ── Tallenna uusi paikka Supabaseen ────────────────────────────────────────
  const saveNewPlace = async (p: SuggestedNewPlace, idx: number) => {
    setSavingNew(prev => new Set(prev).add(idx));
    try {
      // Tarkista canonical-duplikaatti AI-ehdotukselle
      const { unique, wasModified } = resolveUniqueCanonicalName(p.name, p.municipality);
      if (wasModified) {
        const ok = window.confirm(
          `Canonical-nimi "${p.name}" on jo käytössä.\n\n` +
          `Ehdotettu uniikki nimi: "${unique}"\n\nHyväksy ehdotus?`
        );
        if (!ok) { setSavingNew(prev => { const s = new Set(prev); s.delete(idx); return s; }); return; }
      }

      const newPlace = {
        id: crypto.randomUUID(),
        name: p.name,
        canonical_name: unique,
        type: p.type,
        municipality: p.municipality,
        status: 'ACTIVE',
        verified: false,
        importance: 30,
        description: p.description || null,
      };
      const { data, error } = await supabase.from('places').insert(newPlace).select('*').single();
      if (error) throw error;
      // Lisätään paikka suoraan paikalliseen listaan – ei haeta koko listaa uudelleen
      if (data) {
        const mapped: Place = { ...data as any, id: data.place_id || data.id, place_id: data.place_id || data.id };
        setPlaces(prev => [mapped, ...prev]);
      }
      setSavedNew(prev => new Set(prev).add(idx));
    } catch (err: any) {
      alert('Virhe tallennuksessa: ' + err.message);
    } finally {
      setSavingNew(prev => { const s = new Set(prev); s.delete(idx); return s; });
    }
  };

  // ── Kopioi prompt ──────────────────────────────────────────────────────────
  const copyPrompt = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPublishedStatus = (s?: string) => {
    const norm = (s || '').toUpperCase();
    return norm === 'PUBLISHED' || norm === 'ACTIVE';
  };

  const publishedCount = places.filter(p => isPublishedStatus(p.status)).length;
  const draftCount = places.filter(p => (p.status || '').toUpperCase() === 'DRAFT').length;
  const discoveredCount = places.filter(p => (p.status || '').toUpperCase() === 'DISCOVERED').length;
  const archivedCount = places.filter(p => {
    const norm = (p.status || '').toUpperCase();
    return norm === 'ARCHIVED' || norm === 'DELETED';
  }).length;

  const filteredPlaces = places.filter(p => {
    // 1. Status suodatus
    const normStatus = (p.status || '').toUpperCase();
    if (statusFilter === 'PUBLISHED') {
      if (!isPublishedStatus(p.status)) return false;
    } else if (statusFilter === 'DRAFT') {
      if (normStatus !== 'DRAFT') return false;
    } else if (statusFilter === 'DISCOVERED') {
      if (normStatus !== 'DISCOVERED') return false;
    } else if (statusFilter === 'ARCHIVED') {
      if (normStatus !== 'ARCHIVED' && normStatus !== 'DELETED') return false;
    }

    const q = search.toLowerCase();
    if (!q) return true;
    
    // Suora osuma
    const directMatch = (p.name || '').toLowerCase().includes(q) ||
                        (p.canonical_name || '').toLowerCase().includes(q);
    if (directMatch) return true;

    // Osuma ylatasoon (naytetaan tama alakohde)
    if (p.parent_place_id) {
      const parent = places.find(parentPlace => parentPlace.place_id === p.parent_place_id);
      if (parent && ((parent.name || '').toLowerCase().includes(q) || (parent.canonical_name || '').toLowerCase().includes(q))) {
        return true;
      }
    }

    // Osuma alatasoon (naytetaan tama ylakohde)
    const hasMatchingChild = places.some(child => 
      child.parent_place_id === p.place_id && 
      ((child.name || '').toLowerCase().includes(q) || (child.canonical_name || '').toLowerCase().includes(q))
    );
    if (hasMatchingChild) return true;

    return false;
  });
  const selectedPlace = places.find(p => p.id === selectedPlaceId);
  const filteredCompanies = profiles.filter(c =>
    c.name.toLowerCase().includes(companySearch.toLowerCase())
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Otsikko + näkymänvaihto */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <MapPin className="w-8 h-8 text-blue-600" />
            Paikkaverkko
          </h1>
          <p className="text-slate-500 mt-1">LaukaaInfon ja LostReFoundin yhteinen elävä verkosto</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveView('places')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'places' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📍 Paikat
          </button>

          <button
            onClick={() => setActiveView('ai')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'ai' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI Yhdistäminen
          </button>
          <button
            onClick={() => setActiveView('suggestions')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'suggestions' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Ehdotukset
          </button>
          <button
            onClick={() => setActiveView('memories')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'memories' ? 'bg-white shadow text-red-600' : 'text-slate-500 hover:text-red-500'
            }`}
          >
            <span className="iconify" data-icon="material-symbols:history-edu-outline" style={{ fontSize: '1.25rem' }}></span>
            Muistot
          </button>
          <button
            onClick={() => setActiveView('bulk')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'bulk' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-violet-600'
            }`}
          >
            <Zap className="w-4 h-4" />
            Bulk-keräys
          </button>
          <button
            onClick={() => setActiveView('themes')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'themes' ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-emerald-600'
            }`}
          >
            🏷️ Teemat
          </button>
          <button
            onClick={() => setActiveView('theme-images')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === 'theme-images' ? 'bg-white shadow text-violet-700 font-bold' : 'text-slate-500 hover:text-violet-600'
            }`}
          >
            🖼️ Teemakuvat
          </button>
        </div>
      </div>

      {activeView === 'suggestions' && (
        <PlaceSuggestionsManager />
      )}
      
      {activeView === 'memories' && (
        <PlaceMemoriesTab places={places} />
      )}

      {activeView === 'bulk' && (
        <PlaceBulkTab />
      )}

      {activeView === 'themes' && (
        <ThemesManagerView places={places} />
      )}

      {activeView === 'theme-images' && (
        <ThemeImagesManager />
      )}

      {/* ════════════════════════════════════════════
          NÄKYMÄ 1: PAIKKALISTA
      ════════════════════════════════════════════ */}
      {activeView === 'places' && (
        <>
          {/* Status Metrics Bar / Curation Hub */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <button
              onClick={() => setStatusFilter('PUBLISHED')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'PUBLISHED'
                  ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center justify-between">
                <span>⭐ Julkaistut</span>
                {statusFilter === 'PUBLISHED' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
              </div>
              <div className="text-2xl font-extrabold text-emerald-900 mt-1">{publishedCount}</div>
              <div className="text-[11px] text-emerald-600 font-medium">Päätasolla julkaistut paikat</div>
            </button>

            <button
              onClick={() => setStatusFilter('DRAFT')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'DRAFT'
                  ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center justify-between">
                <span>🟡 Tarkistus</span>
                {statusFilter === 'DRAFT' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
              </div>
              <div className="text-2xl font-extrabold text-amber-900 mt-1">{draftCount}</div>
              <div className="text-[11px] text-amber-600 font-medium">Täydennetyt luonnokset</div>
            </button>

            <button
              onClick={() => setStatusFilter('DISCOVERED')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'DISCOVERED'
                  ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center justify-between">
                <span>⚪ Löydetyt (Raaka)</span>
                {statusFilter === 'DISCOVERED' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
              </div>
              <div className="text-2xl font-extrabold text-blue-900 mt-1">{discoveredCount}</div>
              <div className="text-[11px] text-blue-600 font-medium">Automaattihaun osumat</div>
            </button>

            <button
              onClick={() => setStatusFilter('ARCHIVED')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'ARCHIVED'
                  ? 'bg-slate-200 border-slate-400 ring-2 ring-slate-400'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">🗄 Arkistoidut</div>
              <div className="text-2xl font-extrabold text-slate-800 mt-1">{archivedCount}</div>
              <div className="text-[11px] text-slate-500 font-medium">Piilotetut / duplikaatit</div>
            </button>

            <button
              onClick={() => setStatusFilter('ALL')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-400'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-bold text-purple-700 uppercase tracking-wide">🌐 Kaikki</div>
              <div className="text-2xl font-extrabold text-purple-900 mt-1">{places.length}</div>
              <div className="text-[11px] text-purple-600 font-medium">Koko paikkakanta</div>
            </button>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Hae paikkoja (esim. Saraakallio)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>
            <button 
              onClick={() => {
                setSelectedPlaceId(null);
                setEditingPlace({
                  id: '', place_id: crypto.randomUUID(), name: '', canonical_name: '', 
                  type: 'SERVICE', municipality: 'Laukaa', status: 'DRAFT', verified: false, 
                  importance: 10, description: '', lat: undefined, lon: undefined,
                  geometry_type: 'POINT', recognition_zone: 100, parent_place_id: '', place_level: 'LANDMARK',
                  tier: 'PRIMARY', show_in_main_list: true, quality_score: 0
                });
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" />
              Uusi Paikka
            </button>
          </div>

          <div className="flex gap-5" style={{ height: 'calc(100vh - 280px)' }}>
            <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${selectedPlaceId ? 'w-2/3' : 'w-full'}`}>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-5 py-3.5 font-medium">Nimi & Hierarkia</th>
                      <th className="px-5 py-3.5 font-medium">Tyyppi / Taso</th>
                      <th className="px-5 py-3.5 font-medium">Laatu %</th>
                      <th className="px-5 py-3.5 font-medium">Tila</th>
                      <th className="px-5 py-3.5 font-medium text-right">Toiminnot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                          <Loader2 className="w-7 h-7 text-blue-500 animate-spin mx-auto mb-2" />
                          <p className="text-slate-500 text-sm">Haetaan paikkoja Supabasesta...</p>
                        </td>
                      </tr>
                    ) : filteredPlaces.map(place => {
                      const parentChain = getPlaceHierarchyChain(place, places);
                      const calculatedScore = calculateQualityScore(place);
                      const displayScore = place.quality_score && place.quality_score > 0 ? place.quality_score : calculatedScore;

                      let statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">⭐ Julkaistu</span>;
                      if (place.status === 'DRAFT') {
                        statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">🟡 Luonnos</span>;
                      } else if (place.status === 'DISCOVERED') {
                        statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">⚪ Löydetty</span>;
                      } else if (place.status === 'ARCHIVED' || place.status === 'deleted') {
                        statusBadge = <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">🗄 Arkistoitu</span>;
                      }

                      return (
                        <motion.tr
                          key={place.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() => setSelectedPlaceId(place.id === selectedPlaceId ? null : place.id)}
                          className={`transition-colors cursor-pointer border-l-2 ${
                            place.id === selectedPlaceId
                              ? 'bg-blue-50 border-l-blue-500'
                              : 'hover:bg-slate-50 border-l-transparent'
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <div>
                              <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                                <span>{place.name || place.canonical_name}</span>
                                {place.verified && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                                {place.mixonet_place_id && (
                                  <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1">
                                    <Link2 className="w-3 h-3 text-blue-500" /> Mixonet: {place.mixonet_place_id}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(place.place_id);
                                    const el = e.currentTarget;
                                    const originalHtml = el.innerHTML;
                                    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                                    setTimeout(() => { el.innerHTML = originalHtml; }, 1000);
                                  }}
                                  title="Kopioi Place ID"
                                  className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                              {parentChain.length > 0 && (
                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 flex-wrap">
                                  <span>↳</span>
                                  {parentChain.map((p, idx) => (
                                    <React.Fragment key={p.place_id}>
                                      <span className="font-semibold text-blue-700">{p.name}</span>
                                      {idx < parentChain.length - 1 && <span className="text-slate-400">→</span>}
                                    </React.Fragment>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                {getTypeIcon(place.type)}
                                <span className="text-slate-600 text-xs font-medium">{place.place_level || place.type}</span>
                              </div>
                              {place.place_type && (() => {
                                const ptInfo = PLACE_TYPES.find(t => t.value === place.place_type);
                                return (
                                  <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded w-fit">
                                    {ptInfo?.icon || '📍'} {ptInfo?.label || place.place_type}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    displayScore >= 70 ? 'bg-emerald-500' : displayScore >= 40 ? 'bg-amber-500' : 'bg-slate-400'
                                  }`}
                                  style={{ width: `${displayScore}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-600">{displayScore}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {statusBadge}
                          </td>
                          <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {place.status === 'DISCOVERED' && (
                                <button
                                  onClick={() => promoteToPublished(place)}
                                  className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                                  title="Julkaise paikka"
                                >
                                  ⭐ Julkaise
                                </button>
                              )}
                              {place.status !== 'ARCHIVED' && (
                                <button
                                  onClick={() => archivePlace(place)}
                                  className="px-2 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-xs font-medium transition-colors"
                                  title="Arkistoi paikka"
                                >
                                  🗄 Arkistoi
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                    {!isLoading && filteredPlaces.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          <Search className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm">Ei tuloksia haulle "{search}"</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insight-paneeli */}
            <AnimatePresence>
              {selectedPlace && !editingPlace && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: '33%' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden"
                >

                      <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            {getTypeIcon(selectedPlace.type)}
                            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">{selectedPlace.type}</span>
                            {selectedPlace.mixonet_place_id && (
                              <span className="text-[10px] font-mono bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
                                🌐 Mixonet: {selectedPlace.mixonet_place_id}
                              </span>
                            )}
                          </div>
                          <h2 className="text-xl font-bold text-slate-900">{selectedPlace.name || selectedPlace.canonical_name}</h2>
                          <p className="text-sm text-slate-500 mt-0.5">{selectedPlace.municipality}</p>
                          {(() => {
                            const chain = getPlaceHierarchyChain(selectedPlace, places);
                            return chain.length > 0 ? (
                              <div className="text-xs text-blue-700 font-medium mt-1">
                                ↳ Context: {chain.map(p => p.name).join(' → ')}
                              </div>
                            ) : null;
                          })()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setEditingPlace(selectedPlace)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" title="Muokkaa paikkaa">
                            <Edit2 className="w-4 h-4" />
                          </button>
                           {(selectedPlace.type === 'AREA' || selectedPlace.type === 'KUNTA' || selectedPlace.type === 'REGION' || selectedPlace.place_level === 'AREA') && (
                             <button
                               onClick={() => setAreaHierarchyDialogPlace(selectedPlace)}
                               className="p-1.5 text-violet-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors"
                               title="Hallitse alueen hierarkiaa - määritä alikohteet alitasoiksi"
                             >
                               <Layers className="w-4 h-4" />
                             </button>
                           )}
                          <button onClick={() => deletePlace(selectedPlace)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Poista paikka">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setSelectedPlaceId(null); setEditingPlace(null); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors" title="Sulje">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                  <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                          <Store className="w-4 h-4" />
                          <span className="text-xs font-semibold uppercase">Yrityksiä</span>
                        </div>
                        <p className="text-xl font-bold text-slate-800">
                          {placeCompanyCount[selectedPlace.place_id] ?? 0}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                          <Eye className="w-4 h-4" />
                          <span className="text-xs font-semibold uppercase">Havaintoja</span>
                        </div>
                        <p className="text-xl font-bold text-slate-800">0</p>
                      </div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                      <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        AI-yhteenveto
                      </h3>
                      <p className="text-sm text-blue-800/80 leading-relaxed">
                        Tietoja kerätään vähitellen – käytä AI-Yhdistäminen -toimintoa lisäämään kontekstin tälle paikalle.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-slate-400" />
                        Verkostoyhteydet
                      </h3>
                      <p className="text-xs text-slate-400 italic">Ei vielä yhteyksiä. Käytä AI Yhdistäminen -toimintoa.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* MUOKKAUS MODAL */}
      <AnimatePresence>
        {editingPlace && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 text-lg">
                  <Edit2 className="w-5 h-5 text-blue-500" /> Muokkaa paikkaa
                </h3>
                <button onClick={() => { setEditingPlace(null); setCanonicalDuplicate(null); }} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-200 rounded-md">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                {/* LAATUPISTETARKISTUS & AUTOMAATTI-SIIVOUS */}
                {(() => {
                  const analysis = analyzePlaceCleanup(editingPlace, places);
                  const currentScore = calculateQualityScore(editingPlace);
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Aktiivinen Laatutarkistus</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                            currentScore >= 70 ? 'bg-emerald-100 text-emerald-800' : currentScore >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                          }`}>
                            Laatu: {currentScore}%
                          </span>
                          {analysis.missingRequirements.length > 0 && (
                            <span className="text-xs text-slate-500 font-medium">
                              ({analysis.missingRequirements.join(', ')})
                            </span>
                          )}
                        </div>
                      </div>

                      {analysis.suggestedName && (
                        <button
                          type="button"
                          onClick={() => setEditingPlace({...editingPlace, name: analysis.suggestedName, tier: 'SUB_PLACE', parent_place_id: analysis.suggestedParentId || editingPlace.parent_place_id})}
                          className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors"
                        >
                          🪄 Korjaa nimeksi: "{analysis.suggestedName}"
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* 1. PERUSTIEDOT & PAIKKAHIERARKIA */}
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 border-b pb-2 flex items-center gap-2 text-base">
                    <MapPin className="w-4 h-4 text-blue-600" /> Perustiedot & Hierarkia
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Paikan Nimi</label>
                      <input
                        type="text"
                        value={editingPlace.name || ''}
                        onChange={e => setEditingPlace({...editingPlace, name: e.target.value})}
                        className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-sm font-semibold text-slate-900 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Kunta</label>
                      <input
                        type="text"
                        value={editingPlace.municipality || 'Laukaa'}
                        onChange={e => setEditingPlace({...editingPlace, municipality: e.target.value})}
                        className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-sm outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Kuvaus / Esittelyteksti</label>
                    <textarea
                      value={editingPlace.description || ''}
                      onChange={e => setEditingPlace({...editingPlace, description: e.target.value})}
                      className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-3 text-sm outline-none transition-all h-24 resize-none"
                      placeholder="Lyhyt, houkutteleva ja myyvä kuvaus paikasta..."
                    />
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">Aluetaso (place_type)</label>
                        <select
                          value={editingPlace.place_type || 'KOHDE'}
                          onChange={e => setEditingPlace({...editingPlace, place_type: e.target.value})}
                          className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-sm font-bold text-slate-800 outline-none bg-white transition-all"
                        >
                          {PLACE_TYPES.map(pt => (
                            <option key={pt.value} value={pt.value}>
                              {pt.icon} {pt.label} ({pt.value})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">Kohdetyyppi (type)</label>
                        <select
                          value={editingPlace.type || 'SERVICE'}
                          onChange={e => setEditingPlace({...editingPlace, type: e.target.value})}
                          className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-sm font-semibold text-slate-800 outline-none bg-white transition-all"
                        >
                          <option value="NATURE">🌲 Luontokohde (NATURE)</option>
                          <option value="CAMPFIRE_SHELTER">🔥 Laavu / Tulentekopaikka (CAMPFIRE_SHELTER)</option>
                          <option value="VIEWPOINT">👁️ Näköalapaikka (VIEWPOINT)</option>
                          <option value="BEACH">🏖️ Uimaranta (BEACH)</option>
                          <option value="ROUTE">🥾 Retkeilyreitti (ROUTE)</option>
                          <option value="PARK">🌳 Puisto / Ulkoilualue (PARK)</option>
                          <option value="LANDMARK">🏛️ Nähtävyys (LANDMARK)</option>
                          <option value="HISTORICAL_SITE">📜 Historiallinen kohde (HISTORICAL_SITE)</option>
                          <option value="LIBRARY">📚 Kirjasto / Julkinen palvelu (LIBRARY)</option>
                          <option value="SERVICE">🛎️ Yritys- / Palvelukohde (SERVICE)</option>
                          <option value="BUILDING">🏢 Rakennus (BUILDING)</option>
                          <option value="AREA">🗺️ Alue / Luonnonsuojelualue (AREA)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">Julkaisutila</label>
                        <select
                          value={editingPlace.status || 'PUBLISHED'}
                          onChange={e => setEditingPlace({...editingPlace, status: e.target.value})}
                          className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-sm font-bold outline-none bg-white transition-all"
                        >
                          <option value="PUBLISHED">⭐ Julkaistu</option>
                          <option value="DRAFT">🟡 Luonnos (Tarkistettava)</option>
                          <option value="DISCOVERED">⚪ Löydetty (Raaka)</option>
                          <option value="ARCHIVED">🗄 Arkistoitu</option>
                        </select>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 italic border-t border-slate-200/60 pt-2">
                      💡 <strong>Aluetaso</strong> kertoo paikan aseman alueellisessa rakenteessa (Kunta, Taajama, Kylä, Alue, Kohde). <strong>Kohdetyyppi</strong> kertoo, millainen kohde on sisällöllisesti (Luontokohde, Palvelu, Reitti jne.).
                    </p>
                  </div>

                  {/* EMOPAIKAN VALINTA */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Emopaikka (Yläpaikka)</label>
                    
                    {editingPlace.parent_place_id && (() => {
                      const parent = places.find(p => p.place_id === editingPlace.parent_place_id);
                      return parent ? (
                        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <span className="text-blue-600 font-bold">↑ Emopaikka:</span>
                          <span className="font-bold text-sm text-blue-900 flex-1">{parent.name}</span>
                          <button
                            type="button"
                            onClick={() => { setEditingPlace({...editingPlace, parent_place_id: undefined}); setParentPlaceSearch(''); }}
                            className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                            title="Poista emopaikka"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : null;
                    })()}

                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={parentPlaceSearch}
                        onChange={e => setParentPlaceSearch(e.target.value)}
                        placeholder="Hae emopaikkaa nimellä (esim. Vihtavuori)..."
                        className="w-full pl-8 pr-4 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-sm outline-none transition-all"
                      />
                    </div>

                    {parentPlaceSearch.length > 0 && (
                      <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow-sm max-h-40 overflow-y-auto bg-white">
                        <button
                          type="button"
                          onClick={() => { setEditingPlace({...editingPlace, parent_place_id: undefined}); setParentPlaceSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-400 italic hover:bg-slate-50 border-b border-slate-100"
                        >
                          — Ei emopaikkaa (Juuri)
                        </button>
                        {places
                          .filter(p =>
                            p.place_id !== editingPlace.place_id &&
                            ((p.name || '').toLowerCase().includes(parentPlaceSearch.toLowerCase()) ||
                             (p.canonical_name || '').toLowerCase().includes(parentPlaceSearch.toLowerCase()))
                          )
                          .slice(0, 10)
                          .map(p => (
                            <button
                              key={p.place_id}
                              type="button"
                              onClick={() => { setEditingPlace({...editingPlace, parent_place_id: p.place_id, tier: 'SUB_PLACE'}); setParentPlaceSearch(''); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between border-b border-slate-50"
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className="text-xs text-slate-400">{p.municipality}</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>

                  {/* MIXONET SOLMUN SILTA (mixonet_place_id) */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block flex items-center gap-1.5">
                      <Link2 className="w-4 h-4 text-blue-600" /> Mixonet-solmun kytkentä (mixonet_place_id)
                    </label>

                    {/* Rasti ruutuun - Määritä tämä paikka itse Mixonet-solmuksi */}
                    <div className="flex items-center bg-white p-3 rounded-lg border border-slate-200">
                      <label className="flex items-center gap-3 cursor-pointer w-full">
                        <input
                          type="checkbox"
                          checked={editingPlace.mixonet_place_id === (editingPlace.place_id || editingPlace.id)}
                          onChange={e => setEditingPlace({
                            ...editingPlace,
                            mixonet_place_id: e.target.checked ? (editingPlace.place_id || editingPlace.id) : null
                          })}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <div className="font-bold text-slate-800 text-xs">☑ Määritä tämä paikka itse Mixonet-solmuksi</div>
                          <div className="text-[11px] text-slate-500">Paikka toimii verkostonsa solmukohtana (mixonet_place_id = paikan oma ID).</div>
                        </div>
                      </label>
                    </div>

                    {/* Pudotusvalikko Mixonet-solmun valinnalle */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Valitse Mixonet-solmu pudotusvalikosta:</label>
                      <select
                        value={editingPlace.mixonet_place_id || ''}
                        onChange={e => setEditingPlace({ ...editingPlace, mixonet_place_id: e.target.value || null })}
                        className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-xs font-medium bg-white outline-none"
                      >
                        <option value="">-- Ei Mixonet-solmua (NULL) --</option>
                        <option value={editingPlace.place_id || editingPlace.id}>
                          ⭐ Tämä paikka itse: {editingPlace.name || editingPlace.canonical_name} ({editingPlace.place_id?.slice(0, 8) || 'Oma ID'})
                        </option>
                        {places
                          .filter(p => p.place_id !== (editingPlace.place_id || editingPlace.id))
                          .map(p => (
                            <option key={p.place_id} value={p.mixonet_place_id || p.place_id}>
                              {p.name} [{p.municipality}] {p.mixonet_place_id ? `(Solmu: ${p.mixonet_place_id})` : `(ID: ${p.place_id.slice(0, 8)})`}
                            </option>
                          ))
                        }
                      </select>
                    </div>

                    {/* Mukautettu ID / Tunniste */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Tai syötä mukautettu tunniste / ID:</label>
                      <input
                        type="text"
                        value={editingPlace.mixonet_place_id || ''}
                        onChange={e => setEditingPlace({ ...editingPlace, mixonet_place_id: e.target.value || null })}
                        placeholder="esim. L1, L2 tai custom Mixonet-node ID..."
                        className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2 text-xs font-mono outline-none bg-white"
                      />
                    </div>

                    <p className="text-xs text-slate-500 italic">
                      🌐 <strong>Mixonet-solmukytkentä:</strong> Kertoo, toimiiko tämä LaukaaInfon paikka itse tai jonkin emopaikan kautta vastaavana Mixonetin verkostotason solmuna.
                    </p>
                  </div>

                  {/* PÄÄLISTAUKSEN NÄKYVYYS TOGGLE */}
                  <div className="flex items-center bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                    <label className="flex items-center gap-3 cursor-pointer w-full">
                      <input
                        type="checkbox"
                        checked={editingPlace.show_in_main_list ?? true}
                        onChange={e => setEditingPlace({...editingPlace, show_in_main_list: e.target.checked})}
                        className="w-4 h-4 text-blue-600 rounded border-blue-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-blue-900 text-sm">☑ Näytä paikkalistauksessa (pääsivulla)</div>
                        <div className="text-xs text-blue-700">Paikka näkyy päälistassa. Alipaikoille tämän voi jättää pois, jolloin se löytyy isäntäpaikkansa sisältä.</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 2. YRITYKSET JA PALVELUT */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                    <Store className="w-4 h-4 text-green-600" /> Yritykset ja Palvelut
                  </h4>

                  <div className="flex items-center bg-green-50 p-3 rounded-lg border border-green-200">
                    <label className="flex items-center gap-3 cursor-pointer w-full">
                      <input
                        type="checkbox"
                        checked={!!editingPlace.commercial_visibility}
                        onChange={e => setEditingPlace({...editingPlace, commercial_visibility: e.target.checked})}
                        className="w-5 h-5 text-green-600 rounded border-green-300 focus:ring-green-500 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-green-900 text-sm">☑ Salli yritysten ja palveluiden näkyminen tällä paikalla</div>
                        <div className="text-xs text-green-700">Paikkaan voidaan liittää alueen yrityksiä, palveluita ja kumppanuuksia.</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 3. EDISTYNEET TEKNISET ASETUKSET (HAITARI) */}
                <div className="pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="flex items-center justify-between w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-700 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-purple-600" />
                      ⚙️ Edistyneet tekniset asetukset ( importance, place_level, RLS )
                    </span>
                    <ChevronRight className={`w-4 h-4 transition-transform ${showAdvancedSettings ? 'rotate-90' : ''}`} />
                  </button>

                  {showAdvancedSettings && (
                    <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="font-bold text-slate-500 uppercase mb-1 block">Canonical-nimi (hakunimi)</label>
                          <input
                            type="text"
                            value={editingPlace.canonical_name || ''}
                            onChange={e => setEditingPlace({...editingPlace, canonical_name: e.target.value})}
                            className="w-full border border-slate-300 rounded p-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 uppercase mb-1 block">Tärkeys (importance: 1 - 100)</label>
                          <input
                            type="number"
                            value={editingPlace.importance || 10}
                            onChange={e => setEditingPlace({...editingPlace, importance: parseInt(e.target.value) || 10})}
                            className="w-full border border-slate-300 rounded p-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 uppercase mb-1 block">Tekninen paikkataso (place_level DB)</label>
                          <select
                            value={editingPlace.place_level || 'LANDMARK'}
                            onChange={e => setEditingPlace({...editingPlace, place_level: e.target.value})}
                            className="w-full border border-slate-300 rounded p-2 text-xs bg-white"
                          >
                            <option value="REGION">REGION</option>
                            <option value="MUNICIPALITY">MUNICIPALITY</option>
                            <option value="AREA">AREA</option>
                            <option value="DISTRICT">DISTRICT</option>
                            <option value="LANDMARK">LANDMARK</option>
                            <option value="SERVICE">SERVICE</option>
                            <option value="POINT">POINT</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center bg-purple-50 p-2.5 rounded border border-purple-200">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!editingPlace.is_visibility_target}
                            onChange={e => setEditingPlace({...editingPlace, is_visibility_target: e.target.checked})}
                            className="w-4 h-4 text-purple-600 rounded"
                          />
                          <span className="font-bold text-purple-900">Näkyvyyskohde (Visibility Target) – Mukana yrityskumppanuuksien listoilla</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 🗺️ SIJAINTI JA KOORDINAATIT */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                    🗺️ Sijainti – klikkaa kartalla tai raahaa markkeria
                  </label>
                  <CoordinateMapPicker
                    lat={editingPlace.lat}
                    lon={editingPlace.lon}
                    onChange={(lat, lon) => setEditingPlace({ ...editingPlace, lat, lon })}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Leveysaste (Latitude)</label>
                      <input type="number" step="any" value={editingPlace.lat || ''} onChange={e => setEditingPlace({...editingPlace, lat: parseFloat(e.target.value)})} className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-sm outline-none transition-all" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Pituusaste (Longitude)</label>
                      <input type="number" step="any" value={editingPlace.lon || ''} onChange={e => setEditingPlace({...editingPlace, lon: parseFloat(e.target.value)})} className="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg p-2.5 text-sm outline-none transition-all" />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4 pt-3 border-t border-slate-200">
                    <h4 className="font-bold text-slate-800 border-b pb-2">Näkökulmat, Yhteydet ja Lähteet</h4>

                    {/* ── Teemat (place_tags) ── */}
                    <div className="pt-1 border border-emerald-100 rounded-xl p-3 bg-emerald-50/40">
                      <PlaceThemesEditor
                        placeId={editingPlace.place_id}
                        placeName={editingPlace.name || editingPlace.canonical_name || ''}
                        placeType={editingPlace.place_type || editingPlace.type}
                        placeTier={editingPlace.tier}
                      />
                    </div>

                    <div className="pt-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block border-b pb-1 border-slate-200">Liitetyt yritykset</label>
                      {activeRelations.length === 0 ? (
                        <p className="text-xs text-slate-400 italic mb-3">Ei liitettyjä yrityksiä.</p>
                      ) : (
                        <ul className="space-y-1.5 mb-3">
                          {activeRelations.map(rel => {
                            return (
                            <li key={rel.id} className="flex items-center justify-between bg-slate-50 p-2 rounded border border-slate-100">
                              <div>
                                <div className="text-sm text-slate-700 font-medium">{rel.entity_name || rel.entity_id}</div>
                                <div className="text-xs text-slate-500">{rel.relation_type} ({rel.strength}) - {rel.relation_context}</div>
                              </div>
                              <button onClick={() => removeRelation(rel.id)} className="text-red-400 hover:text-red-600 p-1 bg-white hover:bg-red-50 rounded shadow-sm border border-slate-100 transition-colors" title="Poista yhteys">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </li>
                            );
                          })}
                        </ul>
                      )}
                      
                      <div className="flex flex-col gap-2 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-xs font-bold text-slate-500">LISÄÄ UUSI YHTEYS:</span>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Etsi yritystä nimellä..." 
                            value={companySearchTerm}
                            onChange={e => { setCompanySearchTerm(e.target.value); setSelectedCompanyToAdd(null); }}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        {companySearchTerm.length > 1 && !selectedCompanyToAdd && (
                          <ul className="max-h-32 overflow-y-auto bg-white border border-slate-200 rounded shadow-sm">
                            {profiles.filter(p => p.name.toLowerCase().includes(companySearchTerm.toLowerCase())).slice(0, 5).map(p => (
                              <li 
                                key={p.id} 
                                className="px-3 py-1.5 text-sm hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
                                onClick={() => { setSelectedCompanyToAdd(p); setCompanySearchTerm(p.name); }}
                              >
                                {p.name}
                              </li>
                            ))}
                          </ul>
                        )}

                        {selectedCompanyToAdd && (
                          <div className="mt-2 space-y-2">
                            <select value={newRelationType} onChange={e => setNewRelationType(e.target.value)} className="w-full border border-slate-200 rounded p-1.5 text-sm">
                              {dbRelationTypes.length > 0 ? (
                                dbRelationTypes.map(rt => (
                                  <option key={rt.code} value={rt.code}>{rt.name_fi} ({rt.code})</option>
                                ))
                              ) : (
                                <>
                                  <option value="HEAD_OFFICE">Toimipaikka (HEAD_OFFICE)</option>
                                  <option value="SERVICE_AREA">Palvelualue (SERVICE_AREA)</option>
                                  <option value="WORK_LOCATION">Työkohde (WORK_LOCATION)</option>
                                  <option value="EVENT_LOCATION">Tapahtumapaikka (EVENT_LOCATION)</option>
                                  <option value="CUSTOMER_LOCATION">Asiakaskohde (CUSTOMER_LOCATION)</option>
                                  <option value="LANDMARK">Maamerkki (LANDMARK)</option>
                                  <option value="ROUTE">Reitti (ROUTE)</option>
                                  <option value="OTHER">Muu (OTHER)</option>
                                </>
                              )}
                            </select>
                            <select value={newRelationStrength} onChange={e => setNewRelationStrength(e.target.value)} className="w-full border border-slate-200 rounded p-1.5 text-sm">
                              <option value="PRIMARY">Ensisijainen (PRIMARY)</option>
                              <option value="SECONDARY">Toissijainen (SECONDARY)</option>
                              <option value="OCCASIONAL">Satunnainen (OCCASIONAL)</option>
                            </select>
                            <input type="text" placeholder="Konteksti (esim. Palvelee täällä päivittäin)" value={newRelationContext} onChange={e => setNewRelationContext(e.target.value)} className="w-full border border-slate-200 rounded p-1.5 text-sm" />
                            <button 
                              onClick={addRelation} 
                              className="mt-1 w-full bg-blue-100 hover:bg-blue-200 text-blue-700 py-1.5 rounded text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Plus className="w-4 h-4" /> Tallenna yhteys
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6 border-t pt-6 border-slate-200">
                  <PlaceSourcesEditor placeId={editingPlace.place_id} activeRelations={activeRelations} />
                  <PlaceContentEditor placeId={editingPlace.place_id} activeRelations={activeRelations} />
                  <EntityTagsEditor entityType="place" entityId={editingPlace.place_id} />
                </div>

                {/* ─── Kuvat (place_images) ─── */}
                <div className="mt-6 border-t pt-6 border-slate-200">
                  <PlaceMediaEditor placeId={editingPlace.place_id} />
                </div>

                {/* ─── Kohdekortit (kohteet.json) ─── */}
                <div className="mt-6 border-t pt-6 border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📋</span>
                    <h4 className="font-bold text-slate-800">Liitetyt kohdekortit <span className="text-slate-400 font-normal text-sm">(kohteet.json)</span></h4>
                    <span className="ml-auto text-xs text-slate-400 italic">Vain luku – muokkaa Kohdekortti-välilehdellä</span>
                  </div>
                  {linkedEntities.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <span className="text-slate-400 text-sm">Tähän paikkaan ei ole liitetty yhtään kohdekorttia JSON-tiedostossa.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {linkedEntities.map((ent: any) => (
                        <div key={ent.id} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-sm">
                            {ent.type === 'event' ? '🎪' : ent.type === 'association' ? '🤝' : ent.type === 'route' ? '🥾' : ent.type === 'service' ? '⚙️' : '📌'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-amber-900 truncate">{ent.name || ent.id}</p>
                            {ent.shortDescription && (
                              <p className="text-xs text-amber-700 mt-0.5 line-clamp-2">{ent.shortDescription}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5">{ent.type}</span>
                              <span className="text-[10px] text-amber-600 font-mono truncate">#{ent.id}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3 justify-between">
                <button
                  onClick={() => deletePlace(editingPlace)}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                  title="Poista paikka pysyvästi"
                >
                  <Trash2 className="w-4 h-4" /> Poista paikka
                </button>
                <div className="flex gap-3">
                  <button onClick={() => { setEditingPlace(null); setCanonicalDuplicate(null); }} className="px-5 py-2 hover:bg-slate-200 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-bold transition-colors">Peruuta</button>
                  <button onClick={() => savePlaceEdits(editingPlace)} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm shadow-blue-600/20"><Save className="w-4 h-4"/> Tallenna muutokset</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════
          NÄKYMÄ 2: AI YHDISTÄMINEN
      ════════════════════════════════════════════ */}
      {activeView === 'ai' && (
        <div className="flex gap-5" style={{ height: 'calc(100vh - 180px)' }}>

          {/* Vasen: Yritysvalitsin */}
          <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Valitse yritys</p>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Hae yritystä..."
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {filteredCompanies.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCompany(c)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                    selectedCompany?.id === c.id
                      ? 'bg-blue-50 border-l-2 border-l-blue-500'
                      : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <span className="text-sm font-medium text-slate-800 truncate">{c.name}</span>
                  {selectedCompany?.id === c.id && <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Oikea: Prompt + Vastaus + Ehdotukset */}
          <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-hidden">
            {!selectedCompany ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <Sparkles className="w-12 h-12 mb-4 opacity-30" />
                <p className="font-medium">Valitse yritys vasemmalta</p>
                <p className="text-sm mt-1">Generoidaan prompt, jonka voit liittää ChatGPT:hen tai Claudeen</p>
              </div>
            ) : (
              <>
                {/* Prompt-alue */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ flex: '0 0 42%' }}>
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800">1. Kopioi prompt AI:lle</p>
                      <p className="text-xs text-slate-500">Analysoidaan: <strong>{selectedCompany.name}</strong></p>
                    </div>
                    <button
                      onClick={copyPrompt}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        copied
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-slate-800 text-white hover:bg-slate-900'
                      }`}
                    >
                      <Copy className="w-4 h-4" />
                      {copied ? 'Kopioitu!' : 'Kopioi prompt'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={promptText}
                    className="flex-1 w-full p-4 text-xs font-mono text-slate-600 bg-white resize-none outline-none"
                  />
                </div>

                {/* JSON-vastaus */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ flex: '0 0 26%' }}>
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">2. Liitä AI:n JSON-vastaus tähän</p>
                    <button
                      onClick={parseJson}
                      disabled={!jsonResponse.trim()}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Analysoi
                    </button>
                  </div>
                  <textarea
                    value={jsonResponse}
                    onChange={e => { setJsonResponse(e.target.value); setParsedResponse(null); setParseError(null); }}
                    placeholder={'{\n  "suggested_relations": [...],\n  "suggested_new_places": [...]\n}'}
                    className="flex-1 w-full p-4 text-xs font-mono text-slate-700 bg-white resize-none outline-none placeholder:text-slate-300"
                  />
                </div>

                {/* Ehdotukset */}
                <AnimatePresence>
                  {parseError && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-800">JSON-parsinta epäonnistui</p>
                        <p className="text-xs text-red-600 mt-1 font-mono">{parseError}</p>
                      </div>
                    </motion.div>
                  )}
                  {parsedResponse && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0"
                    >
                      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                        <p className="text-sm font-bold text-slate-800">3. Tarkasta ehdotukset</p>
                      </div>
                      <div className="overflow-y-auto h-full p-5 space-y-5">

                        {/* Yhteysehdotukset */}
                        {parsedResponse.suggested_relations.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Link2 className="w-3.5 h-3.5" />
                              Ehdotetut yhteydet paikkaverkkoon
                            </p>
                            <div className="space-y-2">
                              {parsedResponse.suggested_relations.map((rel, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                  <div className="flex items-center gap-3">
                                    <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">{rel.place_name}</p>
                                      <p className="text-xs text-slate-500">syy: <span className="italic">{rel.context}</span></p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${confidenceColor(rel.confidence)}`}>
                                      {rel.confidence}%
                                    </span>
                                    <button
                                      onClick={() => !savedRel.has(i) && saveRelation(rel, i)}
                                      disabled={savingRel.has(i) || savedRel.has(i)}
                                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        savedRel.has(i)
                                          ? 'bg-green-100 text-green-700 border border-green-200 cursor-default'
                                          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                                      }`}
                                    >
                                      {savingRel.has(i) ? <Loader2 className="w-3 h-3 animate-spin" /> :
                                       savedRel.has(i) ? <><CheckSquare className="w-3 h-3" /> Tallennettu</> :
                                       <><Plus className="w-3 h-3" /> Hyväksy</>}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Uudet paikkaehdotukset */}
                        {parsedResponse.suggested_new_places.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Plus className="w-3.5 h-3.5" />
                              Ehdotetut uudet paikat
                            </p>
                            <div className="space-y-2">
                              {parsedResponse.suggested_new_places.map((p, i) => (
                                <div key={i} className={`flex items-center justify-between p-3 border rounded-xl transition-colors ${savedNew.has(i) ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
                                  <div className="flex items-center gap-3">
                                    {getTypeIcon(p.type)}
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                                      <p className="text-xs text-slate-500">{p.type} · {p.municipality}</p>
                                      <p className="text-xs text-slate-400 italic mt-0.5">{p.reason}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => !savedNew.has(i) && saveNewPlace(p, i)}
                                    disabled={savingNew.has(i) || savedNew.has(i)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${
                                      savedNew.has(i)
                                        ? 'bg-green-100 text-green-700 border border-green-200 cursor-default'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                                    }`}
                                  >
                                    {savingNew.has(i) ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                     savedNew.has(i) ? <><CheckSquare className="w-4 h-4" /> Tallennettu</> :
                                     <><Plus className="w-4 h-4" /> Hyväksy & Tallenna</>}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      )}
      {/* ── Alueen hierarkia -dialogi ── */}
      {areaHierarchyDialogPlace && (
        <AreaHierarchyDialog
          area={areaHierarchyDialogPlace}
          allPlaces={places}
          onClose={() => setAreaHierarchyDialogPlace(null)}
          onPlacesUpdated={(updatedPlaces) => {
            setPlaces(updatedPlaces);
            setAreaHierarchyDialogPlace(null);
          }}
        />
      )}
    </div>
  );
};


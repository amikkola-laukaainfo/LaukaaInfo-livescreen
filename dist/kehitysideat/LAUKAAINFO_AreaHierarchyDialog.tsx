import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Layers, MapPin, TreePine, Store, Building, Map,
  CheckSquare, Square, Loader2, GitBranch, AlertCircle, Search
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Tyypit ──────────────────────────────────────────────────────────────────

interface Place {
  id: string;
  place_id: string;
  name: string;
  canonical_name: string;
  type: string;
  municipality: string;
  status: string;
  verified: boolean;
  importance: number;
  description?: string;
  lat?: number;
  lon?: number;
  place_level?: string;
  parent_place_id?: string;
}

interface AreaHierarchyDialogProps {
  area: Place;
  allPlaces: Place[];
  onClose: () => void;
  /** Kutsutaan kun tallennukset on tehty – päivittää paikkalistan */
  onPlacesUpdated: (updatedPlaces: Place[]) => void;
}

// ─── Haversine-etäisyyslaskenta ──────────────────────────────────────────────

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Tyyppikuvakkeet ─────────────────────────────────────────────────────────

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'NATURE':   return <TreePine className="w-4 h-4 text-green-600" />;
    case 'SERVICE':  return <Store className="w-4 h-4 text-blue-600" />;
    case 'BUILDING': return <Building className="w-4 h-4 text-slate-600" />;
    case 'LANDMARK': return <MapPin className="w-4 h-4 text-purple-600" />;
    case 'AREA':     return <Layers className="w-4 h-4 text-violet-600" />;
    default:         return <Map className="w-4 h-4 text-gray-600" />;
  }
};

// ─── Pääkomponentti ──────────────────────────────────────────────────────────

export const AreaHierarchyDialog: React.FC<AreaHierarchyDialogProps> = ({
  area,
  allPlaces,
  onClose,
  onPlacesUpdated,
}) => {
  const [radiusKm, setRadiusKm] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Selvitetään mitkä paikat ovat tällä hetkellä tämän alueen lapsia
  const currentChildren = useMemo(
    () => new Set(allPlaces.filter(p => p.parent_place_id === area.place_id).map(p => p.place_id)),
    [allPlaces, area.place_id]
  );

  // Valittu joukko (alustus nykyisistä lapsista)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentChildren));

  // Lasketaan lähipaikat säteen tai tekstivalinnan mukaan
  const nearbyPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allPlaces
      .filter(p => {
        if (p.place_id === area.place_id) return false;
        if (p.status?.toUpperCase() === 'DELETED') return false;

        // Jos haetaan tekstikentällä: etsitään koko paikkakannasta
        if (q.length > 0) {
          const matchName = (p.name || '').toLowerCase().includes(q);
          const matchCanon = (p.canonical_name || '').toLowerCase().includes(q);
          const matchType = (p.type || '').toLowerCase().includes(q);
          return matchName || matchCanon || matchType;
        }

        // Jos ei tekstihakua:
        // 1. Aina näytetään nykyiset lapset tai valitut kohteet
        const isChild = currentChildren.has(p.place_id) || selected.has(p.place_id);
        if (isChild) return true;

        // 2. Näytetään kohteet säteen sisällä
        if (area.lat != null && area.lon != null && p.lat != null && p.lon != null) {
          const dist = haversineKm(area.lat, area.lon, p.lat, p.lon);
          return dist <= radiusKm;
        }

        return false;
      })
      .map(p => {
        let dist = 9999;
        if (area.lat != null && area.lon != null && p.lat != null && p.lon != null) {
          dist = haversineKm(area.lat, area.lon, p.lat, p.lon);
        }
        return {
          ...p,
          distanceKm: dist,
        };
      })
      .sort((a, b) => {
        // Valitut / nykyiset lapset listan kärkeen, sen jälkeen etäisyysjärjestyksessä
        const aSelected = selected.has(a.place_id) ? 0 : 1;
        const bSelected = selected.has(b.place_id) ? 0 : 1;
        if (aSelected !== bSelected) return aSelected - bSelected;
        return a.distanceKm - b.distanceKm;
      });
  }, [allPlaces, area, radiusKm, searchQuery, currentChildren, selected]);

  // Muutoslaskenta
  const toAdd = useMemo(
    () => [...selected].filter(id => !currentChildren.has(id)),
    [selected, currentChildren]
  );
  const toRemove = useMemo(
    () => [...currentChildren].filter(id => !selected.has(id)),
    [selected, currentChildren]
  );
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  const togglePlace = useCallback((placeId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }, []);

  // ── Tallennus ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Lisätään parent_place_id valituille
      for (const placeId of toAdd) {
        const { error } = await supabase
          .from('places')
          .update({ parent_place_id: area.place_id })
          .eq('place_id', placeId);
        if (error) throw error;
      }

      // Poistetaan parent_place_id poistetuista
      for (const placeId of toRemove) {
        const { error } = await supabase
          .from('places')
          .update({ parent_place_id: null })
          .eq('place_id', placeId);
        if (error) throw error;
      }


      // Päivitetään paikallinen lista
      const updatedPlaces = allPlaces.map(p => {
        if (toAdd.includes(p.place_id)) {
          return { ...p, parent_place_id: area.place_id };
        }
        if (toRemove.includes(p.place_id)) {
          return { ...p, parent_place_id: undefined };
        }
        return p;
      });
      onPlacesUpdated(updatedPlaces);
      onClose();
    } catch (err: any) {
      setSaveError(err.message || 'Tuntematon virhe tallennuksessa');
    } finally {
      setSaving(false);
    }
  };

  const hasCoords = area.lat != null && area.lon != null;

  return (
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Dialogi */}
        <motion.div
          key="dialog"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col max-h-[85vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Otsikko */}
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-slate-50 rounded-t-2xl flex items-start justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Alueen hierarkia</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  <span className="font-semibold text-violet-700">{area.name || area.canonical_name}</span>
                  {' '}— merkitse tähän alueeseen kuuluvat kohteet
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!hasCoords ? (
            /* Ei koordinaatteja */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <p className="font-semibold text-slate-700">Koordinaatit puuttuvat</p>
              <p className="text-sm text-slate-500 max-w-xs">
                Alueen sijainti (lat/lon) on määritettävä ennen kuin lähikohteet voidaan laskea.
                Muokkaa paikkaa ja lisää koordinaatit.
              </p>
            </div>
          ) : (
            <>
              {/* Haku ja säteenvalitsin */}
              <div className="px-6 py-3.5 border-b border-slate-100 flex-shrink-0 bg-slate-50/50 space-y-3">
                {/* Tekstihaku */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Etsi paikkaa nimellä (esim. Hyyppäänvuori, uimaranta)..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold p-0.5"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Säteen säätö ja pikapainikkeet */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                        Hakusäde
                      </label>
                      <span className="text-xs text-slate-400">
                        {searchQuery ? '(haku ohittaa säderajauksen)' : ''}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-violet-700 bg-violet-100/80 border border-violet-200 rounded-md px-2 py-0.5">
                      {radiusKm} km
                    </span>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={30}
                    step={0.5}
                    value={radiusKm}
                    onChange={e => setRadiusKm(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-600 bg-slate-200"
                  />

                  {/* Pikavalinnat */}
                  <div className="flex items-center justify-between gap-1 mt-1.5">
                    {[3, 5, 8, 10, 15, 25].map(km => (
                      <button
                        key={km}
                        type="button"
                        onClick={() => setRadiusKm(km)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                          radiusKm === km
                            ? 'bg-violet-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Kohteiden lista */}
              <div className="flex-1 overflow-y-auto">
                {nearbyPlaces.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                    <MapPin className="w-8 h-8 text-slate-300" />
                    <p className="text-sm text-slate-500">
                      {searchQuery
                        ? `Ei osumia haulla "${searchQuery}"`
                        : `Ei kohteita ${radiusKm} km säteellä`}
                    </p>
                    <p className="text-xs text-slate-400">
                      {searchQuery ? 'Kokeile toista hakusanaa' : 'Kasvata hakusädettä pikapainikkeilla'}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {nearbyPlaces.map(place => {
                      const isSelected = selected.has(place.place_id);
                      const wasChild = currentChildren.has(place.place_id);
                      const changed = isSelected !== wasChild;

                      return (
                        <li
                          key={place.place_id}
                          onClick={() => togglePlace(place.place_id)}
                          className={`flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors select-none ${
                            isSelected
                              ? 'bg-violet-50 hover:bg-violet-100'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className="flex-shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-violet-600" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-300" />
                            )}
                          </div>

                          {/* Tyyppi-ikoni */}
                          <div className="flex-shrink-0">
                            {getTypeIcon(place.type)}
                          </div>

                          {/* Nimi + tiedot */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium truncate ${isSelected ? 'text-violet-900' : 'text-slate-800'}`}>
                                {place.canonical_name || place.name}
                              </span>
                              {changed && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  isSelected
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-600'
                                }`}>
                                  {isSelected ? '+lisätään' : '−poistetaan'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-400">{place.type}</span>
                              {place.place_level && (
                                <span className="text-xs text-slate-300">· {place.place_level}</span>
                              )}
                            </div>
                          </div>

                          {/* Etäisyys */}
                          <div className="flex-shrink-0 text-right">
                            <span className="text-xs font-semibold text-slate-500">
                              {place.distanceKm >= 9000
                                ? '-'
                                : place.distanceKm < 1
                                ? `${Math.round(place.distanceKm * 1000)} m`
                                : `${place.distanceKm.toFixed(1)} km`}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Yhteenveto muutoksista */}
              {hasChanges && (
                <div className="px-6 py-2 bg-amber-50 border-t border-amber-100 flex-shrink-0">
                  <p className="text-xs text-amber-700 font-medium">
                    {toAdd.length > 0 && `+${toAdd.length} lisätään alitasoksi`}
                    {toAdd.length > 0 && toRemove.length > 0 && ' · '}
                    {toRemove.length > 0 && `−${toRemove.length} poistetaan alitasolta`}
                  </p>
                </div>
              )}

              {/* Virheviesti */}
              {saveError && (
                <div className="px-6 py-2 bg-red-50 border-t border-red-100 flex items-center gap-2 flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-600">{saveError}</p>
                </div>
              )}

              {/* Toimintonapit */}
              <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center flex-shrink-0 bg-slate-50 rounded-b-2xl">
                <div className="text-xs text-slate-400">
                  {nearbyPlaces.length} kohdetta {radiusKm} km säteellä
                  {selected.size > 0 && ` · ${selected.size} valittu`}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Peruuta
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Tallennetaan...</>
                    ) : (
                      <><GitBranch className="w-4 h-4" /> Hyväksy muutokset</>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

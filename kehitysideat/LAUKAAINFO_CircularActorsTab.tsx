import React, { useState, useEffect } from 'react';
import { supabaseEncounters } from '../lib/supabaseEncounters';
import {
  RefreshCw,
  Loader2,
  Search,
  Copy,
  Check,
  User,
  Building2,
  ShieldCheck,
  Package,
  Warehouse,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Link2,
  MapPin,
  Calendar,
  Badge
} from 'lucide-react';

// ---- Tyypit ----------------------------------------------------------------

type ActorTier = 'INDIVIDUAL' | 'VERIFIED_ACTIVE' | 'ORGANIZATION';

interface CircularActor {
  id: string;
  actor_code: string;
  display_name: string;
  tier: ActorTier;
  municipality: string | null;
  email: string | null;
  phone: string | null;
  org_name: string | null;
  firebase_uid: string | null;
  is_active: boolean;
  created_at: string;
}

interface CircularStorageNode {
  id: string;
  name: string;
  actor_id: string | null;
  place_id: string | null;
  lat: number | null;
  lon: number | null;
  address: string | null;
  municipality: string;
  capacity_m2: number | null;
  is_active: boolean;
  created_at: string;
}

// ---- Apufunktiot -----------------------------------------------------------

const TIER_LABELS: Record<ActorTier, string> = {
  INDIVIDUAL: 'Yksityishenkilö',
  VERIFIED_ACTIVE: 'Vahvistettu toimija',
  ORGANIZATION: 'Organisaatio / Yritys',
};

const TIER_COLORS: Record<ActorTier, string> = {
  INDIVIDUAL: 'bg-blue-100 text-blue-700',
  VERIFIED_ACTIVE: 'bg-emerald-100 text-emerald-700',
  ORGANIZATION: 'bg-purple-100 text-purple-700',
};

const TIER_ICON: Record<ActorTier, React.ReactNode> = {
  INDIVIDUAL: <User size={12} />,
  VERIFIED_ACTIVE: <ShieldCheck size={12} />,
  ORGANIZATION: <Building2 size={12} />,
};

function TierBadge({ tier }: { tier: ActorTier }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${TIER_COLORS[tier]}`}>
      {TIER_ICON[tier]}
      {TIER_LABELS[tier]}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="ml-1 text-gray-400 hover:text-emerald-600 transition-colors" title="Kopioi">
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ---- Pääkomponentti --------------------------------------------------------

export function CircularActorsTab() {
  const [actors, setActors] = useState<CircularActor[]>([]);
  const [storageNodes, setStorageNodes] = useState<CircularStorageNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<ActorTier | 'ALL'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'actors' | 'nodes'>('actors');

  // Uuden aktorin luonti
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMunicipality, setNewMunicipality] = useState('Laukaa');
  const [newTier, setNewTier] = useState<ActorTier>('INDIVIDUAL');
  const [newEmail, setNewEmail] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Mikrovarasto-luonti
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [nodeActorCode, setNodeActorCode] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [nodeAddress, setNodeAddress] = useState('');
  const [nodeCapacity, setNodeCapacity] = useState('');
  const [nodeMunicipality, setNodeMunicipality] = useState('Laukaa');
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [nodeError, setNodeError] = useState('');

  // ---- Lataus ---------------------------------------------------------------

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [actorsRes, nodesRes] = await Promise.all([
        supabaseEncounters
          .from('circular_actors')
          .select('*')
          .order('created_at', { ascending: false }),
        supabaseEncounters
          .from('circular_storage_nodes')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);
      if (actorsRes.error) throw actorsRes.error;
      if (nodesRes.error) throw nodesRes.error;
      setActors(actorsRes.data || []);
      setStorageNodes(nodesRes.data || []);
    } catch (e: any) {
      setError(e.message || 'Lataus epäonnistui');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ---- Suodatus -------------------------------------------------------------

  const filteredActors = actors.filter(a => {
    const matchSearch =
      a.display_name.toLowerCase().includes(search.toLowerCase()) ||
      a.actor_code.toLowerCase().includes(search.toLowerCase()) ||
      (a.municipality || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.org_name || '').toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === 'ALL' || a.tier === tierFilter;
    return matchSearch && matchTier;
  });

  // ---- Uuden aktorin luonti -------------------------------------------------

  const handleCreateActor = async () => {
    if (!newName.trim()) { setCreateError('Nimi on pakollinen'); return; }
    setIsCreating(true);
    setCreateError('');
    try {
      const { data, error } = await supabaseEncounters
        .from('circular_actors')
        .insert({
          display_name: newName.trim(),
          municipality: newMunicipality,
          tier: newTier,
          email: newEmail.trim() || null,
          org_name: newTier === 'ORGANIZATION' ? newOrgName.trim() || null : null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      setActors(prev => [data, ...prev]);
      setShowCreateForm(false);
      setNewName(''); setNewEmail(''); setNewOrgName('');
      setNewTier('INDIVIDUAL'); setNewMunicipality('Laukaa');
    } catch (e: any) {
      setCreateError(e.message || 'Luonti epäonnistui');
    } finally {
      setIsCreating(false);
    }
  };

  // ---- Mikrovarasto-luonti --------------------------------------------------

  const handleCreateNode = async () => {
    if (!nodeName.trim()) { setNodeError('Nimi on pakollinen'); return; }
    setIsCreatingNode(true);
    setNodeError('');
    try {
      // Hae actor_id koodilla jos annettu
      let actorId: string | null = null;
      if (nodeActorCode.trim()) {
        const { data: actorData } = await supabaseEncounters
          .from('circular_actors')
          .select('id')
          .eq('actor_code', nodeActorCode.trim().toUpperCase())
          .single();
        actorId = actorData?.id || null;
        if (!actorId) { setNodeError('Aktorikoodia ei löydy: ' + nodeActorCode); setIsCreatingNode(false); return; }
      }
      const { data, error } = await supabaseEncounters
        .from('circular_storage_nodes')
        .insert({
          name: nodeName.trim(),
          actor_id: actorId,
          address: nodeAddress.trim() || null,
          municipality: nodeMunicipality,
          capacity_m2: nodeCapacity ? parseFloat(nodeCapacity) : null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      setStorageNodes(prev => [data, ...prev]);
      setShowNodeForm(false);
      setNodeName(''); setNodeAddress(''); setNodeCapacity(''); setNodeActorCode('');
    } catch (e: any) {
      setNodeError(e.message || 'Luonti epäonnistui');
    } finally {
      setIsCreatingNode(false);
    }
  };

  // ---- Tilamuutos -----------------------------------------------------------

  const toggleActive = async (actor: CircularActor) => {
    const { error } = await supabaseEncounters
      .from('circular_actors')
      .update({ is_active: !actor.is_active })
      .eq('id', actor.id);
    if (!error) {
      setActors(prev => prev.map(a => a.id === actor.id ? { ...a, is_active: !a.is_active } : a));
    }
  };

  // ---- Render ---------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 opacity-50">
        <Loader2 className="animate-spin text-emerald-600 mb-4" size={28} />
        <p className="text-sm font-bold text-gray-500">Ladataan kiertotalouttoimijoita...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-3">
        <AlertCircle size={28} />
        <p className="text-sm font-bold">{error}</p>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-all">
          <RefreshCw size={12} /> Yritä uudelleen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Otsikko + osastonapit */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-gray-800">Kiertotalous – Toimijat & Mikrovarastot</h2>
          <p className="text-xs text-gray-400 mt-0.5">LostReFound-kiertotalouden aktorikoodit ja säilytyssolmut</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-200 transition-all">
          <RefreshCw size={12} /> Päivitä
        </button>
      </div>

      {/* Osastovalitsin */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        <button
          onClick={() => setActiveSection('actors')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border border-b-0 transition-all ${
            activeSection === 'actors'
              ? 'bg-white border-gray-200 text-emerald-700 -mb-px'
              : 'bg-gray-50 border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <User size={13} /> Toimijat ({actors.length})
        </button>
        <button
          onClick={() => setActiveSection('nodes')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border border-b-0 transition-all ${
            activeSection === 'nodes'
              ? 'bg-white border-gray-200 text-emerald-700 -mb-px'
              : 'bg-gray-50 border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <Warehouse size={13} /> Mikrovarastot ({storageNodes.length})
        </button>
      </div>

      {/* ===== TOIMIJAT-OSIO ===== */}
      {activeSection === 'actors' && (
        <div className="space-y-3">
          {/* Haku + suodatus + lisäys */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Hae nimellä, koodilla, kunnalla..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 bg-white"
              />
            </div>
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value as any)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-gray-600 focus:outline-none focus:border-emerald-400"
            >
              <option value="ALL">Kaikki tasot</option>
              <option value="INDIVIDUAL">Yksityishenkilö</option>
              <option value="VERIFIED_ACTIVE">Vahvistettu</option>
              <option value="ORGANIZATION">Organisaatio</option>
            </select>
            <button
              onClick={() => setShowCreateForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-500/20"
            >
              <Plus size={13} /> Luo aktori
            </button>
          </div>

          {/* Luontilomake */}
          {showCreateForm && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-emerald-800">Uusi LI-aktori</h3>
                <button onClick={() => setShowCreateForm(false)}><X size={14} className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Näyttönimi *</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nimimerkki tai nimi"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Kunta</label>
                  <input value={newMunicipality} onChange={e => setNewMunicipality(e.target.value)} placeholder="Laukaa"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Taso</label>
                  <select value={newTier} onChange={e => setNewTier(e.target.value as ActorTier)}
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400">
                    <option value="INDIVIDUAL">Yksityishenkilö</option>
                    <option value="VERIFIED_ACTIVE">Vahvistettu toimija</option>
                    <option value="ORGANIZATION">Organisaatio / Yritys</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Sähköposti</label>
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="(valinnainen)"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
                {newTier === 'ORGANIZATION' && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Organisaation nimi</label>
                    <input value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="Yritys / Yhdistys"
                      className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                  </div>
                )}
              </div>
              {createError && <p className="text-xs text-red-500 font-bold">{createError}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCreateForm(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50">Peruuta</button>
                <button onClick={handleCreateActor} disabled={isCreating}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                  {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Luo aktori
                </button>
              </div>
              <p className="text-[10px] text-emerald-600 bg-emerald-100 rounded-lg px-2 py-1">
                ✦ Aktorikoodi (LI-XXXX-XXXX) generoidaan automaattisesti tietokannassa.
              </p>
            </div>
          )}

          {/* Aktorilista */}
          {filteredActors.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <User size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-xs font-bold">Ei toimijoita hakuehdoilla</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActors.map(actor => {
                const isExpanded = expandedId === actor.id;
                const nodeCount = storageNodes.filter(n => n.actor_id === actor.id).length;
                return (
                  <div key={actor.id}
                    className={`bg-white border rounded-xl transition-all ${isExpanded ? 'border-emerald-300 shadow-sm shadow-emerald-100' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : actor.id)}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${actor.is_active ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                        {actor.tier === 'ORGANIZATION' ? <Building2 size={16} className={actor.is_active ? 'text-emerald-600' : 'text-gray-400'} />
                          : actor.tier === 'VERIFIED_ACTIVE' ? <ShieldCheck size={16} className={actor.is_active ? 'text-emerald-600' : 'text-gray-400'} />
                          : <User size={16} className={actor.is_active ? 'text-emerald-600' : 'text-gray-400'} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-800 truncate">{actor.display_name}</span>
                          {!actor.is_active && <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">INAKTIIVINEN</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {actor.actor_code}
                          </span>
                          <CopyButton text={actor.actor_code} />
                          <TierBadge tier={actor.tier} />
                          {actor.municipality && (
                            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                              <MapPin size={9} /> {actor.municipality}
                            </span>
                          )}
                          {nodeCount > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                              <Warehouse size={9} /> {nodeCount} varasto
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                      </div>
                    </div>

                    {/* Laajennettu näkymä */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                          <div><span className="text-gray-400 font-bold">ID:</span> <span className="font-mono text-gray-600 text-[10px]">{actor.id}</span></div>
                          <div><span className="text-gray-400 font-bold">Firebase UID:</span> <span className="font-mono text-gray-600 text-[10px]">{actor.firebase_uid || '—'}</span></div>
                          {actor.email && <div><span className="text-gray-400 font-bold">Email:</span> <span>{actor.email}</span></div>}
                          {actor.org_name && <div><span className="text-gray-400 font-bold">Org:</span> <span>{actor.org_name}</span></div>}
                          <div><span className="text-gray-400 font-bold">Luotu:</span> <span>{new Date(actor.created_at).toLocaleDateString('fi-FI')}</span></div>
                        </div>

                        {/* Liitetyt mikrovarastot */}
                        {nodeCount > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Mikrovarastot</p>
                            <div className="space-y-1">
                              {storageNodes.filter(n => n.actor_id === actor.id).map(node => (
                                <div key={node.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs">
                                  <Warehouse size={11} className="text-gray-400 shrink-0" />
                                  <span className="font-bold text-gray-700">{node.name}</span>
                                  {node.address && <span className="text-gray-400">· {node.address}</span>}
                                  {node.capacity_m2 && <span className="text-gray-400">· {node.capacity_m2} m²</span>}
                                  <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full ${node.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                    {node.is_active ? 'Aktiivinen' : 'Inaktiivinen'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            onClick={() => toggleActive(actor)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                              actor.is_active
                                ? 'border-red-200 text-red-500 hover:bg-red-50'
                                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {actor.is_active ? 'Deaktivoi' : 'Aktivoi'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== MIKROVARASTOT-OSIO ===== */}
      {activeSection === 'nodes' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">Fyysiset säilytys- ja luovutuspisteet kiertotalouskierrossa</p>
            <button
              onClick={() => setShowNodeForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-500/20"
            >
              <Plus size={13} /> Lisää mikrovarasto
            </button>
          </div>

          {/* Mikrovaraston luontilomake */}
          {showNodeForm && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-emerald-800">Uusi mikrovarasto</h3>
                <button onClick={() => setShowNodeForm(false)}><X size={14} className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Nimi *</label>
                  <input value={nodeName} onChange={e => setNodeName(e.target.value)} placeholder="esim. Laukaan kierrätyspiste"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Aktorikoodi (LI-XXXX-XXXX)</label>
                  <input value={nodeActorCode} onChange={e => setNodeActorCode(e.target.value)} placeholder="(valinnainen)"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Osoite</label>
                  <input value={nodeAddress} onChange={e => setNodeAddress(e.target.value)} placeholder="Tie 1, Laukaa"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Kunta</label>
                  <input value={nodeMunicipality} onChange={e => setNodeMunicipality(e.target.value)} placeholder="Laukaa"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Kapasiteetti (m²)</label>
                  <input value={nodeCapacity} onChange={e => setNodeCapacity(e.target.value)} type="number" placeholder="esim. 20"
                    className="w-full mt-0.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-400" />
                </div>
              </div>
              {nodeError && <p className="text-xs text-red-500 font-bold">{nodeError}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNodeForm(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50">Peruuta</button>
                <button onClick={handleCreateNode} disabled={isCreatingNode}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                  {isCreatingNode ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Tallenna
                </button>
              </div>
            </div>
          )}

          {/* Mikrovarastolista */}
          {storageNodes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Warehouse size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-xs font-bold">Ei mikrovarastoja</p>
              <p className="text-[10px] mt-1">Luo ensimmäinen klikkaamalla "Lisää mikrovarasto"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {storageNodes.map(node => {
                const ownerActor = actors.find(a => a.id === node.actor_id);
                return (
                  <div key={node.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${node.is_active ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                      <Warehouse size={16} className={node.is_active ? 'text-emerald-600' : 'text-gray-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-800">{node.name}</span>
                        {!node.is_active && <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">INAKTIIVINEN</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-gray-400">
                        {node.address && <span className="flex items-center gap-0.5"><MapPin size={9} /> {node.address}</span>}
                        <span>{node.municipality}</span>
                        {node.capacity_m2 && <span>· {node.capacity_m2} m²</span>}
                        {ownerActor && (
                          <span className="flex items-center gap-1 text-emerald-600 font-bold">
                            <Link2 size={9} /> {ownerActor.actor_code} · {ownerActor.display_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-300 font-mono shrink-0">
                      {new Date(node.created_at).toLocaleDateString('fi-FI')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


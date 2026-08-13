import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trash2, Eye, Map } from 'lucide-react';
import Modal from '../components/Modal';

interface Observation {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  address?: string;
  imageUrls?: string[];
  location?: { lat: number; lng: number };
  createdAt?: any;
}

export default function Observations() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedObs, setSelectedObs] = useState<Observation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'observations'));
    // Normally you would orderBy('timestamp', 'desc') if the index exists
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const obsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Observation[];
      
      // Sort manually if no index
      obsData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setObservations(obsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching observations: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm("Haluatko varmasti poistaa tÃ¤mÃ¤n havainnon?")) {
      try {
        await deleteDoc(doc(db, 'observations', id));
      } catch (error) {
        console.error("Error deleting document: ", error);
        alert("Poistaminen epÃ¤onnistui.");
      }
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    setStatusUpdating(true);
    try {
      await updateDoc(doc(db, 'observations', id), {
        status: newStatus
      });
      if (selectedObs && selectedObs.id === id) {
        setSelectedObs({ ...selectedObs, status: newStatus });
      }
    } catch (error) {
      console.error("Error updating status: ", error);
      alert("Tilan pÃ¤ivitys epÃ¤onnistui.");
    } finally {
      setStatusUpdating(false);
    }
  };

  const openModal = (obs: Observation) => {
    setSelectedObs(obs);
    setIsModalOpen(true);
  };

  // Get unique categories for the filter dropdown
  const categories = Array.from(new Set(observations.map(obs => obs.category).filter(Boolean))) as string[];

  const filteredObservations = observations.filter(obs => {
    const matchesStatus = filterStatus === 'ALL' || obs.status === filterStatus;
    const matchesCategory = filterCategory === 'ALL' || obs.category === filterCategory;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === '' || 
      (obs.title && obs.title.toLowerCase().includes(searchLower)) ||
      (obs.address && obs.address.toLowerCase().includes(searchLower)) ||
      (obs.description && obs.description.toLowerCase().includes(searchLower));
    
    return matchesStatus && matchesCategory && matchesSearch;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800">Havaintojen hallinta</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">Suodata havaintoja ja pÃ¤ivitÃ¤ niiden tiloja.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Etsi (otsikko, osoite, kuvaus)</label>
            <input 
              type="text" 
              placeholder="Etsi..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tila</label>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="ALL">Kaikki tilat</option>
              <option value="NEW">NEW (Uusi)</option>
              <option value="IN_PROGRESS">IN_PROGRESS (TyÃ¶n alla)</option>
              <option value="RESOLVED">RESOLVED (Valmis)</option>
              <option value="REJECTED">REJECTED (HylÃ¤tty)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kategoria / Teema</label>
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="ALL">Kaikki kategoriat</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-500">
              <th className="p-4 font-medium">Otsikko / Kategoria</th>
              <th className="p-4 font-medium">Osoite</th>
              <th className="p-4 font-medium">Tila</th>
              <th className="p-4 font-medium">PÃ¤ivÃ¤mÃ¤Ã¤rÃ¤</th>
              <th className="p-4 font-medium text-right">Toiminnot</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">Ladataan...</td>
              </tr>
            ) : filteredObservations.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">Ei havaintoja valituilla suodattimilla.</td>
              </tr>
            ) : (
              filteredObservations.map(obs => (
                <tr key={obs.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <p className="font-medium text-gray-900">{obs.title || 'NimetÃ¶n havainto'}</p>
                    <p className="text-sm text-gray-500">{obs.category || '-'}</p>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{obs.address || '-'}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      obs.status === 'NEW' ? 'bg-amber-100 text-amber-800' :
                      obs.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                      obs.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {obs.status || 'NEW'}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {obs.createdAt?.toDate ? obs.createdAt.toDate().toLocaleDateString('fi-FI') : '-'}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button 
                      onClick={() => openModal(obs)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="NÃ¤ytÃ¤ tiedot"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(obs.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Poista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Havainnon tiedot"
      >
        {selectedObs && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Otsikko</h4>
                <p className="text-gray-900 font-medium">{selectedObs.title || '-'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Kategoria</h4>
                <p className="text-gray-900">{selectedObs.category || '-'}</p>
              </div>
              <div className="col-span-full">
                <h4 className="text-sm font-medium text-gray-500 mb-1">Kuvaus</h4>
                <p className="text-gray-900 bg-gray-50 p-4 rounded-lg">{selectedObs.description || 'Ei kuvausta.'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Sijainti</h4>
                <p className="text-gray-900 mb-2">{selectedObs.address || 'Ei osoitetta'}</p>
                {selectedObs.location && (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedObs.location.lat},${selectedObs.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Map className="w-4 h-4 mr-1" />
                    Katso kartalla ({selectedObs.location.lat.toFixed(4)}, {selectedObs.location.lng.toFixed(4)})
                  </a>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">Vaihda tila</h4>
                <div className="flex items-center space-x-2">
                  <select 
                    value={selectedObs.status || 'NEW'}
                    onChange={(e) => handleStatusUpdate(selectedObs.id, e.target.value)}
                    disabled={statusUpdating}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="NEW">NEW (Uusi)</option>
                    <option value="IN_PROGRESS">IN_PROGRESS (TyÃ¶n alla)</option>
                    <option value="RESOLVED">RESOLVED (Valmis)</option>
                    <option value="REJECTED">REJECTED (HylÃ¤tty)</option>
                  </select>
                  {statusUpdating && <span className="text-xs text-gray-500">PÃ¤ivitetÃ¤Ã¤n...</span>}
                </div>
              </div>
            </div>

            {selectedObs.imageUrls && selectedObs.imageUrls.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">Kuvat</h4>
                <div className="grid grid-cols-2 gap-4">
                  {selectedObs.imageUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`Havainto ${i+1}`} className="w-full h-48 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}


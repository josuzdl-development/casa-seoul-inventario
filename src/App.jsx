import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Package, TrendingDown, TrendingUp, BarChart3, Globe2, ShieldCheck, Calculator, Download, LogOut, Lock } from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
let app, auth, db, appId;
try {
  // Asegúrate de reemplazar esto con tus llaves reales de Firebase si aún no lo has hecho en Vercel
  const firebaseConfig = {
  apiKey: "AIzaSyBbBGbZqAtm5BJi0FiGavraGhNE04-yf2E",
  authDomain: "casa-seoul-inventario.firebaseapp.com",
  projectId: "casa-seoul-inventario",
  storageBucket: "casa-seoul-inventario.firebasestorage.app",
  messagingSenderId: "312640933963",
  appId: "1:312640933963:web:53e3158ba2944b2ab7fdce"
  };
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = typeof __app_id !== 'undefined' ? __app_id : 'casa-seoul-inventario';
} catch (error) {
  console.error("Error inicializando Firebase", error);
}

// Catálogo base de ejemplo
const MAESTRO_PRODUCTOS = [
];

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  
  // --- SISTEMA DE ROLES Y LOGIN SECRETO ---
  const [userRole, setUserRole] = useState(null); // 'admin' | 'invitado' | null
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  
  const [activeTab, setActiveTab] = useState('stock');
  const [isKoreaView, setIsKoreaView] = useState(false);
  const [exportCategory, setExportCategory] = useState('Todas');
  
  const [ingresos, setIngresos] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [notification, setNotification] = useState('');

  const [formIngreso, setFormIngreso] = useState({
    loteId: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: ''
  });
  const [formSalida, setFormSalida] = useState({
    sku: '', cantidad: '', precioTotal: '', canalVenta: 'Instagram', metodoPago: 'Yape', comprobante: 'Boleta', documentoCliente: ''
  });

  // --- 1. AUTENTICACIÓN FIREBASE (Fondo) ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsubscribe();
  }, []);

  // --- 2. OBTENER DATOS ---
  useEffect(() => {
    if (!firebaseUser || !db) return;

    const ingresosRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'ingresos');
    const unsubIngresos = onSnapshot(ingresosRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setIngresos(data);
    }, (error) => console.error(error));

    const salidasRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'salidas');
    const unsubSalidas = onSnapshot(salidasRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSalidas(data);
    }, (error) => console.error(error));

    return () => {
      unsubIngresos();
      unsubSalidas();
    };
  }, [firebaseUser]);

  // --- 3. LÓGICA DE STOCK ---
  const stockCalculado = useMemo(() => {
    const stockMap = {};
    
    MAESTRO_PRODUCTOS.forEach(prod => {
      stockMap[prod.sku] = { ...prod, totalIngresos: 0, totalSalidas: 0, stockActual: 0, costoPromedio: 0, valorTotal: 0 };
    });

    ingresos.forEach(ing => {
      if (!stockMap[ing.sku]) stockMap[ing.sku] = { sku: ing.sku, nombre: 'Producto Desconocido', totalIngresos: 0, totalSalidas: 0, stockActual: 0, valorTotal: 0, categoria: 'Otros' };
      stockMap[ing.sku].totalIngresos += Number(ing.cantidad);
      stockMap[ing.sku].valorTotal += (Number(ing.costoUnitarioReal) * Number(ing.cantidad));
    });

    salidas.forEach(sal => {
      if (stockMap[sal.sku]) stockMap[sal.sku].totalSalidas += Number(sal.cantidad);
    });

    Object.values(stockMap).forEach(item => {
      item.stockActual = item.totalIngresos - item.totalSalidas;
      item.costoPromedio = item.totalIngresos > 0 ? (item.valorTotal / item.totalIngresos) : 0;
    });

    // FILTRO DE PRIVACIDAD: Si es invitado, ocultar tecnología
    let finalStock = Object.values(stockMap);
    if (userRole === 'invitado') {
      finalStock = finalStock.filter(item => item.categoria !== 'Tecnología');
    }

    return finalStock;
  }, [ingresos, salidas, userRole]);

  // --- 4. EXPORTAR A CSV ---
  const handleExportCSV = () => {
    let dataToExport = stockCalculado;
    
    if (exportCategory !== 'Todas') {
      dataToExport = dataToExport.filter(item => item.categoria === exportCategory);
    }

    const headers = ['SKU', 'Producto', 'Categoria', 'Marca', 'Ingresos', 'Salidas', 'Stock_Actual', 'Costo_Promedio_Soles'];
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(item => 
        `"${item.sku}","${item.nombre}","${item.categoria}","${item.marca}",${item.totalIngresos},${item.totalSalidas},${item.stockActual},${item.costoPromedio.toFixed(2)}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `CasaSeoul_Inventario_${exportCategory}_${new Date().toLocaleDateString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- LOGIN HANDLER ---
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    const { username, password } = loginForm;
    
    if (username === 'admin' && password === '@dmin135') {
      setUserRole('admin');
      setActiveTab('stock');
    } else if (username === 'invitado' && password === 'invitado123') {
      setUserRole('invitado');
      setIsKoreaView(true); // El invitado solo ve la vista de stock general
    } else {
      setNotification('❌ Credenciales incorrectas');
      setTimeout(() => setNotification(''), 3000);
    }
  };

  // --- ACCIONES DE GUARDADO (Solo Admin) ---
  const handleGuardarIngreso = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || userRole !== 'admin') return;

    const cFob = Number(formIngreso.costoFob);
    const cFlete = Number(formIngreso.flete);
    const cAduanas = Number(formIngreso.aduanas);
    const qty = Number(formIngreso.cantidad);
    
    const costoTotalLote = cFob + cFlete + cAduanas;
    const costoUnitarioReal = costoTotalLote / qty;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'ingresos'), {
        ...formIngreso, costoTotalLote, costoUnitarioReal, createdAt: serverTimestamp()
      });
      setNotification('✅ Ingreso registrado con éxito');
      setFormIngreso({ loteId: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: '' });
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      setNotification('❌ Error al guardar');
    }
  };

  const handleGuardarSalida = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || userRole !== 'admin') return;

    const itemStock = stockCalculado.find(s => s.sku === formSalida.sku);
    if (!itemStock || itemStock.stockActual < Number(formSalida.cantidad)) {
      setNotification('❌ No hay stock suficiente');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'salidas'), {
        ...formSalida, createdAt: serverTimestamp()
      });
      setNotification('✅ Venta registrada con éxito');
      setFormSalida({ sku: '', cantidad: '', precioTotal: '', canalVenta: 'Instagram', metodoPago: 'Yape', comprobante: 'Boleta', documentoCliente: '' });
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      setNotification('❌ Error al registrar venta');
    }
  };

  // ==========================================
  // PANTALLA DE LOGIN (Sin pistas, segura)
  // ==========================================
  if (!userRole) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">CASA SEOUL</h1>
            <p className="text-gray-500 text-sm mt-1 uppercase tracking-widest">Sistema de Gestión</p>
          </div>

          {notification && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium text-center">
              {notification}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <input 
                type="text" 
                required 
                placeholder="Usuario" 
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                value={loginForm.username}
                onChange={e => setLoginForm({...loginForm, username: e.target.value})}
              />
            </div>
            <div>
              <input 
                type="password" 
                required 
                placeholder="Contraseña" 
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                value={loginForm.password}
                onChange={e => setLoginForm({...loginForm, password: e.target.value})}
              />
            </div>
            <button type="submit" className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-lg transition-colors">
              Ingresar al Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: VISTA COREA / INVITADOS
  // ==========================================
  const renderVistaCorea = () => (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Korea Dashboard</h2>
          <p className="text-gray-500">Live Inventory Status - Seoul HQ</p>
        </div>
        <Globe2 className="w-8 h-8 text-blue-500 opacity-50" />
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wide">
              <th className="p-4 border-b">SKU / Item ID</th>
              <th className="p-4 border-b">Product Name</th>
              <th className="p-4 border-b">Category</th>
              <th className="p-4 border-b">Current Stock</th>
              <th className="p-4 border-b">Status</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {stockCalculado.map(item => (
              <tr key={item.sku} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 border-b font-mono text-sm">{item.sku}</td>
                <td className="p-4 border-b font-medium">{item.nombre}</td>
                <td className="p-4 border-b">{item.categoria}</td>
                <td className="p-4 border-b font-bold text-lg">{item.stockActual}</td>
                <td className="p-4 border-b">
                  {item.stockActual <= 5 ? (
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">REORDER</span>
                  ) : (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">IN STOCK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ==========================================
  // MAIN APP RENDER
  // ==========================================
  return (
    <div className="min-h-screen bg-gray-100 flex font-sans">
      
      {/* SIDEBAR (Solo para Admin) */}
      {userRole === 'admin' && !isKoreaView && (
        <aside className="w-64 bg-gray-900 text-white flex flex-col">
          <div className="p-6">
            <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">
              CASA SEOUL
            </h1>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest">Admin System</p>
          </div>
          
          <nav className="flex-1 px-4 space-y-2 mt-4">
            <button onClick={() => setActiveTab('stock')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'stock' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Package className="w-5 h-5" /> Stock & Maestro
            </button>
            <button onClick={() => setActiveTab('ingreso')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'ingreso' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <TrendingDown className="w-5 h-5" /> Registrar Ingreso
            </button>
            <button onClick={() => setActiveTab('salida')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'salida' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <TrendingUp className="w-5 h-5" /> Registrar Venta
            </button>
            <button onClick={() => setActiveTab('reporte')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'reporte' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <BarChart3 className="w-5 h-5" /> Reportes & SUNAT
            </button>
          </nav>
          
          <div className="p-4 border-t border-gray-800">
             <button onClick={() => { setUserRole(null); setLoginForm({username: '', password: ''}) }} className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
               <LogOut className="w-4 h-4" /> Cerrar Sesión
             </button>
          </div>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-8 overflow-auto relative">
        
        {/* Header Superior Derecho (Controles) */}
        <div className="absolute top-6 right-8 flex items-center gap-6">
          
          {/* Botón de Logout para Invitados */}
          {userRole === 'invitado' && (
             <button onClick={() => { setUserRole(null); setLoginForm({username: '', password: ''}) }} className="text-sm font-medium text-red-600 flex items-center gap-2 hover:underline">
               <LogOut className="w-4 h-4" /> Salir
             </button>
          )}

          {/* Toggle Vista Corea (Solo Admin) */}
          {userRole === 'admin' && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500">
                {isKoreaView ? 'Regresar a Admin' : 'Simular Vista Socios Corea'}
              </span>
              <button 
                onClick={() => setIsKoreaView(!isKoreaView)}
                className={`w-14 h-7 rounded-full flex items-center transition-colors p-1 ${isKoreaView ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${isKoreaView ? 'translate-x-7' : ''}`}></div>
              </button>
            </div>
          )}
        </div>

        {notification && (
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-xl font-medium z-50">
            {notification}
          </div>
        )}

        {(isKoreaView || userRole === 'invitado') ? (
          <div className="mt-12">{renderVistaCorea()}</div>
        ) : (
          <div className="mt-8 max-w-6xl mx-auto space-y-6">
            
            {/* VISTA STOCK / MAESTRO */}
            {activeTab === 'stock' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Package className="text-indigo-600" /> Control Maestro de Inventario
                  </h2>
                  
                  {/* HERRAMIENTA EXPORTAR */}
                  <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Exportar:</span>
                    <select 
                      className="text-sm border-none bg-transparent outline-none font-medium text-gray-700 cursor-pointer"
                      value={exportCategory}
                      onChange={(e) => setExportCategory(e.target.value)}
                    >
                      <option value="Todas">Todo el Inventario</option>
                      <option value="Álbumes">Solo Álbumes</option>
                      <option value="Tecnología">Solo Tecnología</option>
                      <option value="Lightsticks">Solo Lightsticks</option>
                    </select>
                    <button 
                      onClick={handleExportCSV}
                      className="ml-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded shadow transition-colors flex items-center gap-1 text-sm"
                      title="Descargar CSV"
                    >
                      <Download className="w-4 h-4" /> CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="p-3">SKU</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3">Total Ingresos</th>
                        <th className="p-3">Total Salidas</th>
                        <th className="p-3">Stock Real</th>
                        <th className="p-3 text-right">Costo Prom. Real (S/)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockCalculado.map(item => (
                        <tr key={item.sku} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-mono font-medium">{item.sku}</td>
                          <td className="p-3">{item.nombre} <span className="text-xs text-gray-400 block">{item.marca}</span></td>
                          <td className="p-3 text-blue-600 font-medium">{item.totalIngresos}</td>
                          <td className="p-3 text-orange-600 font-medium">{item.totalSalidas}</td>
                          <td className="p-3 font-bold text-lg">
                            <span className={item.stockActual <= 5 ? 'text-red-600' : 'text-green-600'}>
                              {item.stockActual}
                            </span>
                          </td>
                          <td className="p-3 text-right text-gray-600 font-medium">S/ {item.costoPromedio.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VISTA REGISTRO DE INGRESO */}
            {activeTab === 'ingreso' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="mb-6 pb-4 border-b">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <TrendingDown className="text-blue-600" /> Registrar Ingreso de Lote
                  </h2>
                </div>
                <form onSubmit={handleGuardarIngreso} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Controles de Ingreso... idénticos al código anterior */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ID de Lote (Tracking)</label>
                      <input required value={formIngreso.loteId} onChange={e => setFormIngreso({...formIngreso, loteId: e.target.value})} className="w-full border p-2 rounded outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Producto (SKU)</label>
                      <select required value={formIngreso.sku} onChange={e => setFormIngreso({...formIngreso, sku: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option value="">Selecciona...</option>
                        {MAESTRO_PRODUCTOS.map(p => <option key={p.sku} value={p.sku}>{p.sku} - {p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                      <input required type="number" min="1" value={formIngreso.cantidad} onChange={e => setFormIngreso({...formIngreso, cantidad: e.target.value})} className="w-full border p-2 rounded outline-none" />
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                    <h3 className="font-bold flex items-center gap-2 text-gray-700"><Calculator className="w-4 h-4"/> Costos (S/)</h3>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Costo FOB Total</label>
                      <input required type="number" step="0.01" value={formIngreso.costoFob} onChange={e => setFormIngreso({...formIngreso, costoFob: e.target.value})} className="w-full border p-2 rounded outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Flete Internacional</label>
                        <input required type="number" step="0.01" value={formIngreso.flete} onChange={e => setFormIngreso({...formIngreso, flete: e.target.value})} className="w-full border p-2 rounded outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Aduanas</label>
                        <input required type="number" step="0.01" value={formIngreso.aduanas} onChange={e => setFormIngreso({...formIngreso, aduanas: e.target.value})} className="w-full border p-2 rounded outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">IGV Pagado</label>
                      <input required type="number" step="0.01" value={formIngreso.igv} onChange={e => setFormIngreso({...formIngreso, igv: e.target.value})} className="w-full border p-2 rounded outline-none bg-white" />
                    </div>
                  </div>
                  <div className="md:col-span-2 flex justify-end mt-4">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold">Guardar Lote</button>
                  </div>
                </form>
              </div>
            )}

            {/* VISTA REGISTRO DE SALIDA */}
            {activeTab === 'salida' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                 <div className="mb-6 pb-4 border-b">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="text-green-600" /> Registrar Venta / Salida
                  </h2>
                </div>
                <form onSubmit={handleGuardarSalida} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Producto Vendido</label>
                      <select required value={formSalida.sku} onChange={e => setFormSalida({...formSalida, sku: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option value="">Selecciona...</option>
                        {stockCalculado.map(p => <option key={p.sku} value={p.sku} disabled={p.stockActual <= 0}>{p.sku} - {p.nombre} (Stock: {p.stockActual})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                        <input required type="number" min="1" value={formSalida.cantidad} onChange={e => setFormSalida({...formSalida, cantidad: e.target.value})} className="w-full border p-2 rounded outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Precio Total</label>
                        <input required type="number" step="0.01" value={formSalida.precioTotal} onChange={e => setFormSalida({...formSalida, precioTotal: e.target.value})} className="w-full border p-2 rounded outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Canal de Venta</label>
                      <select value={formSalida.canalVenta} onChange={e => setFormSalida({...formSalida, canalVenta: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option>Instagram</option>
                        <option>WhatsApp</option>
                        <option>Feria K-Pop</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                    <h3 className="font-bold flex items-center gap-2 text-gray-700"><ShieldCheck className="w-4 h-4"/> Datos de Pago</h3>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Método de Pago</label>
                      <select value={formSalida.metodoPago} onChange={e => setFormSalida({...formSalida, metodoPago: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option>Yape / Plin</option>
                        <option>Transferencia BCP</option>
                        <option>Efectivo</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Comprobante</label>
                        <select value={formSalida.comprobante} onChange={e => setFormSalida({...formSalida, comprobante: e.target.value})} className="w-full border p-2 rounded outline-none">
                          <option>Boleta</option>
                          <option>Factura</option>
                          <option>Nota de Venta</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">DNI / RUC</label>
                        <input type="text" value={formSalida.documentoCliente} onChange={e => setFormSalida({...formSalida, documentoCliente: e.target.value})} className="w-full border p-2 rounded outline-none" />
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-2 flex justify-end mt-4">
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold">Registrar Venta</button>
                  </div>
                </form>
              </div>
            )}

            {/* VISTA REPORTES */}
            {activeTab === 'reporte' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                  <BarChart3 className="text-purple-600" /> Historial Rápido
                </h2>
                <p className="text-sm text-gray-500 mb-4">Aquí puedes ver los últimos registros que ingresaste en la base de datos.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Últimas Ventas</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full text-xs text-left bg-gray-50">
                        <tbody>
                          {salidas.slice(0,5).map(s => (
                            <tr key={s.id} className="border-b"><td className="p-2">{s.sku}</td><td className="p-2 text-green-600 font-bold">S/ {s.precioTotal}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Últimos Lotes</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full text-xs text-left bg-gray-50">
                        <tbody>
                          {ingresos.slice(0,5).map(i => (
                            <tr key={i.id} className="border-b"><td className="p-2 font-mono">{i.loteId}</td><td className="p-2">{i.sku}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
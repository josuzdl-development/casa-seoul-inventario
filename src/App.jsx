import './index.css';
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Package, TrendingDown, TrendingUp, BarChart3, Globe2, ShieldCheck, Calculator, Download, LogOut, Lock } from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
let app, auth, db, appId;
try {
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

// Catálogo base de ejemplo (Si la BD está vacía)
const MAESTRO_PRODUCTOS = [
  { sku: 'ALB-BTS-01', nombre: 'Album Proof (Standard Ed.)', categoria: 'Álbumes', marca: 'BTS' },
  { sku: 'LS-BTS-01', nombre: 'Official Lightstick MotS', categoria: 'Lightsticks', marca: 'BTS' },
  { sku: 'PH-ENH-01', nombre: 'Photocard Romance: Untold', categoria: 'Photocards', marca: 'Enhypen' },
  { sku: 'TEC-APP-01', nombre: 'iPhone 15 Pro Max 256GB', categoria: 'Tecnología', marca: 'Apple' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('stock'); // stock, ingreso, salida, reportes
  
  // Nuevos estados para roles y exportación
  const [appRole, setAppRole] = useState(null); // 'admin' o 'invitado'
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });
  const [exportCat, setExportCat] = useState('Todos');
  
  // Datos de la base de datos
  const [ingresos, setIngresos] = useState([]);
  const [salidas, setSalidas] = useState([]);

  // Estados para formularios
  const [formIngreso, setFormIngreso] = useState({
    loteId: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: ''
  });
  const [formSalida, setFormSalida] = useState({
    sku: '', cantidad: '', precioTotal: '', canalVenta: 'Instagram', metodoPago: 'Yape', comprobante: 'Boleta', documentoCliente: ''
  });

  const [notification, setNotification] = useState('');

  // --- 1. AUTENTICACIÓN ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- 2. OBTENER DATOS (LISTENERS) ---
  useEffect(() => {
    if (!user || !db) return;

    // Escuchar Ingresos
    const ingresosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'ingresos');
    const unsubIngresos = onSnapshot(ingresosRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordenar en memoria (descendente por fecha)
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setIngresos(data);
    }, (error) => console.error(error));

    // Escuchar Salidas
    const salidasRef = collection(db, 'artifacts', appId, 'users', user.uid, 'salidas');
    const unsubSalidas = onSnapshot(salidasRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setSalidas(data);
    }, (error) => console.error(error));

    return () => {
      unsubIngresos();
      unsubSalidas();
    };
  }, [user]);

  // --- 3. LÓGICA DE STOCK (EL CEREBRO) ---
  const stockCalculado = useMemo(() => {
    const stockMap = {};
    
    // Inicializar con el maestro
    MAESTRO_PRODUCTOS.forEach(prod => {
      stockMap[prod.sku] = { ...prod, totalIngresos: 0, totalSalidas: 0, stockActual: 0, costoPromedio: 0, valorTotal: 0 };
    });

    // Sumar ingresos y calcular costo promedio
    ingresos.forEach(ing => {
      if (!stockMap[ing.sku]) {
        stockMap[ing.sku] = { sku: ing.sku, nombre: 'Producto Desconocido', totalIngresos: 0, totalSalidas: 0, stockActual: 0, valorTotal: 0 };
      }
      stockMap[ing.sku].totalIngresos += Number(ing.cantidad);
      stockMap[ing.sku].valorTotal += (Number(ing.costoUnitarioReal) * Number(ing.cantidad));
    });

    // Sumar salidas
    salidas.forEach(sal => {
      if (stockMap[sal.sku]) {
        stockMap[sal.sku].totalSalidas += Number(sal.cantidad);
      }
    });

    // Calcular final
    Object.values(stockMap).forEach(item => {
      item.stockActual = item.totalIngresos - item.totalSalidas;
      item.costoPromedio = item.totalIngresos > 0 ? (item.valorTotal / item.totalIngresos) : 0;
    });

    return Object.values(stockMap);
  }, [ingresos, salidas]);

  // --- 4. ACCIONES DE GUARDADO ---
  const handleGuardarIngreso = async (e) => {
    e.preventDefault();
    if (!user || !db) return;

    // Prorrateo matemático: El costo real de aduanas excluye IGV (el IGV es crédito fiscal, no costo).
    const cFob = Number(formIngreso.costoFob);
    const cFlete = Number(formIngreso.flete);
    const cAduanas = Number(formIngreso.aduanas);
    const qty = Number(formIngreso.cantidad);
    
    const costoTotalLote = cFob + cFlete + cAduanas;
    const costoUnitarioReal = costoTotalLote / qty;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'ingresos'), {
        ...formIngreso,
        costoTotalLote,
        costoUnitarioReal,
        createdAt: serverTimestamp()
      });
      setNotification('✅ Ingreso de Lote registrado con éxito');
      setFormIngreso({ loteId: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: '' });
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      console.error(error);
      setNotification('❌ Error al guardar');
      setTimeout(() => setNotification(''), 3000);
    }
  };

  const handleGuardarSalida = async (e) => {
    e.preventDefault();
    if (!user || !db) return;

    // Verificar stock antes de vender
    const itemStock = stockCalculado.find(s => s.sku === formSalida.sku);
    if (!itemStock || itemStock.stockActual < Number(formSalida.cantidad)) {
      alert("No hay suficiente stock para realizar esta venta.");
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'salidas'), {
        ...formSalida,
        createdAt: serverTimestamp()
      });
      setNotification('✅ Venta registrada con éxito');
      setFormSalida({ sku: '', cantidad: '', precioTotal: '', canalVenta: 'Instagram', metodoPago: 'Yape', comprobante: 'Boleta', documentoCliente: '' });
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      console.error(error);
      setNotification('❌ Error al registrar venta');
    }
  };

  // --- LÓGICA DE LOGIN Y EXPORTACIÓN ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (loginForm.user === 'admin' && loginForm.pass === 'admin123') {
      setAppRole('admin');
      setNotification('✅ Bienvenido, Administrador');
    } else if (loginForm.user === 'invitado' && loginForm.pass === 'invitado123') {
      setAppRole('invitado');
      setNotification('✅ Bienvenido, Invitado');
    } else {
      setNotification('❌ Credenciales incorrectas');
    }
    setTimeout(() => setNotification(''), 3000);
  };

  const handleLogout = () => {
    setAppRole(null);
    setLoginForm({ user: '', pass: '' });
  };

  const handleExportCSV = () => {
    let dataToExport = stockCalculado;
    if (exportCat !== 'Todos') {
      dataToExport = dataToExport.filter(item => item.categoria === exportCat);
    }
    
    const headers = ['SKU', 'Nombre', 'Categoria', 'Marca', 'Stock Real', 'Costo Prom. (S/)'];
    const rows = dataToExport.map(item => [
      item.sku, `"${item.nombre}"`, item.categoria, item.marca, item.stockActual, item.costoPromedio.toFixed(2)
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Inventario_${exportCat}.csv`;
    link.click();
  };

  const categoriasDisponibles = ['Todos', ...new Set(MAESTRO_PRODUCTOS.map(p => p.categoria))];

  // --- RENDERIZADO CONDICIONAL DE VISTAS ---
  const renderVistaInvitado = () => {
    // Filtrar tecnología (iPhones, etc.) para el invitado
    const stockInvitado = stockCalculado.filter(item => item.categoria !== 'Tecnología');
    
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Stock General (Vista Externa)</h2>
            <p className="text-gray-500">Consulta de disponibilidad para proveedores</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg font-medium transition-colors">
            <LogOut className="w-5 h-5" /> Salir
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wide">
                <th className="p-4 border-b">SKU / Item ID</th>
                <th className="p-4 border-b">Producto</th>
                <th className="p-4 border-b">Categoría</th>
                <th className="p-4 border-b">Stock</th>
                <th className="p-4 border-b">Estado</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {stockInvitado.map(item => (
                <tr key={item.sku} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 border-b font-mono text-sm">{item.sku}</td>
                  <td className="p-4 border-b font-medium">{item.nombre} <span className="block text-xs text-gray-400">{item.marca}</span></td>
                  <td className="p-4 border-b">{item.categoria}</td>
                  <td className="p-4 border-b font-bold text-lg">{item.stockActual}</td>
                  <td className="p-4 border-b">
                    {item.stockActual <= 0 ? (
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">AGOTADO</span>
                    ) : (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">DISPONIBLE</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (!appRole) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md relative">
          {notification && (
            <div className="absolute -top-16 left-0 right-0 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg text-center text-sm font-bold z-50">
              {notification}
            </div>
          )}
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-600 p-4 rounded-full text-white shadow-lg shadow-indigo-200">
              <Lock className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-center text-gray-900 mb-2 tracking-tighter">CASA SEOUL</h1>
          <p className="text-center text-gray-500 font-medium mb-8">Portal de Acceso</p>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Usuario</label>
              <input required type="text" value={loginForm.user} onChange={e => setLoginForm({...loginForm, user: e.target.value})} className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-indigo-600 focus:bg-indigo-50 transition-colors" placeholder="Ej: admin" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Contraseña</label>
              <input required type="password" value={loginForm.pass} onChange={e => setLoginForm({...loginForm, pass: e.target.value})} className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-indigo-600 focus:bg-indigo-50 transition-colors" placeholder="••••••••" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl transition-colors shadow-lg shadow-indigo-200 mt-4">
              INGRESAR AL SISTEMA
            </button>
          </form>
          <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-500 text-center space-y-2">
            <p className="font-bold text-gray-700 mb-2">Credenciales de Acceso:</p>
            <div className="flex justify-between bg-gray-50 p-2 rounded"><span>Admin:</span> <span className="font-mono font-bold text-indigo-600">admin / admin123</span></div>
            <div className="flex justify-between bg-gray-50 p-2 rounded"><span>Invitado:</span> <span className="font-mono font-bold text-indigo-600">invitado / invitado123</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex font-sans">
      
      {/* SIDEBAR (Solo visible para Admin) */}
      {appRole === 'admin' && (
        <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
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

          <div className="p-4 border-t border-gray-800 mt-auto">
            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-sm font-bold transition-colors">
              <LogOut className="w-5 h-5" /> Cerrar Sesión
            </button>
          </div>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-8 overflow-auto relative">
        
        {notification && (
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-xl font-medium z-50">
            {notification}
          </div>
        )}

        {appRole === 'invitado' ? (
          <div className="mt-8 max-w-5xl mx-auto">{renderVistaInvitado()}</div>
        ) : (
          <div className="mt-8 max-w-6xl mx-auto space-y-6">
            
            {/* VISTA STOCK / MAESTRO */}
            {activeTab === 'stock' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Package className="text-indigo-600" /> Control Maestro de Inventario
                  </h2>
                  
                  {/* BOTÓN DE EXPORTACIÓN CON FILTRO */}
                  <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200 shadow-sm">
                    <span className="text-sm font-medium text-gray-600 pl-2">Exportar CSV:</span>
                    <select 
                      value={exportCat} 
                      onChange={(e) => setExportCat(e.target.value)}
                      className="text-sm border-gray-300 rounded outline-none p-1.5 bg-white font-medium text-gray-700"
                    >
                      {categoriasDisponibles.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button 
                      onClick={handleExportCSV}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
                    >
                      <Download className="w-4 h-4" /> Descargar
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

            {/* VISTA REGISTRO DE INGRESO (ADUANAS Y LOTES) */}
            {activeTab === 'ingreso' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="mb-6 pb-4 border-b">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <TrendingDown className="text-blue-600" /> Registrar Ingreso de Lote (Importación)
                  </h2>
                  <p className="text-gray-500 text-sm mt-1">Ingresa los costos totales prorrateados para calcular el costo unitario exacto.</p>
                </div>

                <form onSubmit={handleGuardarIngreso} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ID de Lote (Tracking / Factura)</label>
                      <input required value={formIngreso.loteId} onChange={e => setFormIngreso({...formIngreso, loteId: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: LOTE-MAY-01" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Producto (SKU)</label>
                      <select required value={formIngreso.sku} onChange={e => setFormIngreso({...formIngreso, sku: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="">Selecciona un producto...</option>
                        {MAESTRO_PRODUCTOS.map(p => <option key={p.sku} value={p.sku}>{p.sku} - {p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad Recibida</label>
                      <input required type="number" min="1" value={formIngreso.cantidad} onChange={e => setFormIngreso({...formIngreso, cantidad: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                    <h3 className="font-bold flex items-center gap-2 text-gray-700"><Calculator className="w-4 h-4"/> Costos del Lote (en Soles S/)</h3>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Costo FOB Total (Valor Mercadería)</label>
                      <input required type="number" step="0.01" value={formIngreso.costoFob} onChange={e => setFormIngreso({...formIngreso, costoFob: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.00" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Flete Internacional</label>
                        <input required type="number" step="0.01" value={formIngreso.flete} onChange={e => setFormIngreso({...formIngreso, flete: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="0.00" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Aduanas (Ad Valorem)</label>
                        <input required type="number" step="0.01" value={formIngreso.aduanas} onChange={e => setFormIngreso({...formIngreso, aduanas: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="0.00" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">IGV Pagado (Para Crédito Fiscal)</label>
                      <input required type="number" step="0.01" value={formIngreso.igv} onChange={e => setFormIngreso({...formIngreso, igv: e.target.value})} className="w-full border p-2 rounded outline-none bg-white" placeholder="0.00" />
                    </div>
                    
                    {formIngreso.cantidad && formIngreso.costoFob && (
                       <div className="mt-4 p-3 bg-blue-100 text-blue-800 rounded font-bold flex justify-between">
                         <span>Costo Unitario Real Estimado:</span>
                         <span>S/ {((Number(formIngreso.costoFob) + Number(formIngreso.flete) + Number(formIngreso.aduanas)) / Number(formIngreso.cantidad)).toFixed(2)}</span>
                       </div>
                    )}
                  </div>
                  
                  <div className="md:col-span-2 flex justify-end mt-4">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">
                      Guardar Lote en Inventario
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* VISTA REGISTRO DE SALIDA (VENTAS) */}
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Producto Vendido (SKU)</label>
                      <select required value={formSalida.sku} onChange={e => setFormSalida({...formSalida, sku: e.target.value})} className="w-full border p-2 rounded focus:ring-2 focus:ring-green-500 outline-none">
                        <option value="">Selecciona un producto...</option>
                        {stockCalculado.map(p => (
                           <option key={p.sku} value={p.sku} disabled={p.stockActual <= 0}>
                             {p.sku} - {p.nombre} (Stock: {p.stockActual})
                           </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                        <input required type="number" min="1" value={formSalida.cantidad} onChange={e => setFormSalida({...formSalida, cantidad: e.target.value})} className="w-full border p-2 rounded outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Precio Total Cobrado</label>
                        <input required type="number" step="0.01" value={formSalida.precioTotal} onChange={e => setFormSalida({...formSalida, precioTotal: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="S/ 0.00" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Canal de Venta</label>
                      <select value={formSalida.canalVenta} onChange={e => setFormSalida({...formSalida, canalVenta: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option>Instagram</option>
                        <option>WhatsApp</option>
                        <option>Feria K-Pop</option>
                        <option>Por Mayor</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                    <h3 className="font-bold flex items-center gap-2 text-gray-700"><ShieldCheck className="w-4 h-4"/> Datos para SUNAT / Facturación</h3>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Método de Pago</label>
                      <select value={formSalida.metodoPago} onChange={e => setFormSalida({...formSalida, metodoPago: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option>Yape / Plin</option>
                        <option>Transferencia BCP</option>
                        <option>Tarjeta Crédito/Débito</option>
                        <option>Efectivo</option>
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Comprobante</label>
                        <select value={formSalida.comprobante} onChange={e => setFormSalida({...formSalida, comprobante: e.target.value})} className="w-full border p-2 rounded outline-none">
                          <option>Boleta</option>
                          <option>Factura</option>
                          <option>Nota de Venta (Interna)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">DNI / RUC Cliente</label>
                        <input type="text" value={formSalida.documentoCliente} onChange={e => setFormSalida({...formSalida, documentoCliente: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="Opcional..." />
                      </div>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2 flex justify-end mt-4">
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">
                      Registrar Venta
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* VISTA REPORTES (Historial) */}
            {activeTab === 'reporte' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                  <BarChart3 className="text-purple-600" /> Historial de Operaciones
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Tabla Últimas Salidas */}
                  <div>
                    <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Últimas Ventas</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-2">Fecha</th>
                            <th className="p-2">SKU</th>
                            <th className="p-2">Cant.</th>
                            <th className="p-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salidas.slice(0,10).map(s => (
                            <tr key={s.id} className="border-t">
                              <td className="p-2">{s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : 'Reciente'}</td>
                              <td className="p-2 font-mono">{s.sku}</td>
                              <td className="p-2">{s.cantidad}</td>
                              <td className="p-2 font-bold text-green-600">S/ {s.precioTotal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Tabla Últimos Ingresos */}
                  <div>
                    <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Últimos Lotes Recibidos</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-2">Lote</th>
                            <th className="p-2">SKU</th>
                            <th className="p-2">Cost. Total</th>
                            <th className="p-2">IGV Decl.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ingresos.slice(0,10).map(i => (
                            <tr key={i.id} className="border-t">
                              <td className="p-2 font-medium">{i.loteId}</td>
                              <td className="p-2 font-mono">{i.sku}</td>
                              <td className="p-2">S/ {i.costoTotalLote}</td>
                              <td className="p-2 text-blue-600">S/ {i.igv}</td>
                            </tr>
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
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Package, TrendingDown, TrendingUp, BarChart3, Globe2, ShieldCheck, Calculator, Download, LogOut, Lock, Edit2, Trash2, X, Tags } from 'lucide-react';

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

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  
  // --- SISTEMA DE ROLES Y LOGIN SECRETO ---
  const [userRole, setUserRole] = useState(null); // 'admin' | 'invitado' | null
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  
  const [activeTab, setActiveTab] = useState('stock');
  const [isKoreaView, setIsKoreaView] = useState(false);
  const [exportCategory, setExportCategory] = useState('Todas');
  
  const [productos, setProductos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [notification, setNotification] = useState('');

  const [formProducto, setFormProducto] = useState({ sku: '', nombre: '', categoria: '', marca: '' });
  const [formIngreso, setFormIngreso] = useState({
    loteId: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: ''
  });
  const [formSalida, setFormSalida] = useState({
    sku: '', cantidad: '', precioTotal: '', canalVenta: '', metodoPago: '', comprobante: '', documentoCliente: ''
  });

  const [editingItem, setEditingItem] = useState(null);

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

    const productosRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'productos');
    const unsubProductos = onSnapshot(productosRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProductos(data);
    }, (error) => console.error(error));

    const ingresosRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'ingresos');
    const unsubIngresos = onSnapshot(ingresosRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordenar descendente
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setIngresos(data);
    }, (error) => console.error(error));

    const salidasRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'salidas');
    const unsubSalidas = onSnapshot(salidasRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setSalidas(data);
    }, (error) => console.error(error));

    return () => {
      unsubProductos();
      unsubIngresos();
      unsubSalidas();
    };
  }, [firebaseUser]);

  // --- 3. LÓGICA DE STOCK ---
  const stockCalculado = useMemo(() => {
    const stockMap = {};
    
    productos.forEach(prod => {
      stockMap[prod.sku] = { ...prod, totalIngresos: 0, totalSalidas: 0, stockActual: 0, costoPromedio: 0, valorTotal: 0 };
    });

    ingresos.forEach(ing => {
      if (!stockMap[ing.sku]) stockMap[ing.sku] = { sku: ing.sku, nombre: 'Producto Eliminado', totalIngresos: 0, totalSalidas: 0, stockActual: 0, valorTotal: 0, categoria: 'Otros', marca: '-' };
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
  }, [ingresos, salidas, userRole, productos]);

  const categoriasUnicas = useMemo(() => {
    const cats = new Set(productos.map(p => p.categoria));
    return Array.from(cats);
  }, [productos]);

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
    
    if (username === 'admin' && password === 'admin123') {
      setUserRole('admin');
      setActiveTab('stock');
    } else if (username === 'invitado' && password === 'invitado123') {
      setUserRole('invitado');
      setIsKoreaView(true);
    } else {
      setNotification('❌ Credenciales incorrectas');
      setTimeout(() => setNotification(''), 3000);
    }
  };

  // --- ACCIONES DE GUARDADO (Solo Admin) ---
  const handleGuardarProducto = async (e) => {
    e.preventDefault();
    
    if (!firebaseUser || !db) {
      setNotification('⏳ Conectando a la base de datos... intenta de nuevo.');
      setTimeout(() => setNotification(''), 3000);
      return;
    }
    
    if (userRole !== 'admin') return;

    const skuIngresado = formProducto.sku?.trim().toUpperCase();
    
    const existeSKU = productos.some(p => p && p.sku && p.sku.toUpperCase() === skuIngresado);

    if (existeSKU) {
      setNotification('❌ El SKU ya existe en el catálogo');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'productos'), {
        ...formProducto,
        sku: skuIngresado,
        createdAt: serverTimestamp()
      });
      setNotification('✅ Producto añadido al catálogo');
      setFormProducto({ sku: '', nombre: '', categoria: '', marca: '' });
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      console.error("Error al guardar producto:", error);
      setNotification('❌ Error al guardar producto');
      setTimeout(() => setNotification(''), 3000);
    }
  };

  const handleGuardarIngreso = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || userRole !== 'admin') return;

    const cFob = Number(formIngreso.costoFob || 0);
    const cFlete = Number(formIngreso.flete || 0);
    const cAduanas = Number(formIngreso.aduanas || 0);
    const qty = Number(formIngreso.cantidad || 1);
    
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
      setNotification('❌ No hay stock suficiente para esta venta');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'salidas'), {
        ...formSalida, createdAt: serverTimestamp()
      });
      setNotification('✅ Venta registrada con éxito');
      setFormSalida({ sku: '', cantidad: '', precioTotal: '', canalVenta: '', metodoPago: '', comprobante: '', documentoCliente: '' });
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      setNotification('❌ Error al registrar venta');
    }
  };

  const handleDelete = async (coleccion, id) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro? El stock se recalculará automáticamente.')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', firebaseUser.uid, coleccion, id));
      setNotification('✅ Registro eliminado');
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      setNotification('❌ Error al eliminar');
    }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || !editingItem) return;

    let updatedData = { ...editingItem.data };
    
    if (editingItem.type === 'ingresos') {
      const cFob = Number(updatedData.costoFob || 0);
      const cFlete = Number(updatedData.flete || 0);
      const cAduanas = Number(updatedData.aduanas || 0);
      const qty = Number(updatedData.cantidad || 1);
      updatedData.costoTotalLote = cFob + cFlete + cAduanas;
      updatedData.costoUnitarioReal = updatedData.costoTotalLote / qty;
    }

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', firebaseUser.uid, editingItem.type, editingItem.id), updatedData);
      setNotification('✅ Registro actualizado con éxito');
      setEditingItem(null);
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      setNotification('❌ Error al actualizar');
    }
  };

  // ==========================================
  // PANTALLA DE LOGIN
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
            {stockCalculado.length === 0 && (
              <tr><td colSpan="5" className="p-4 text-center text-gray-500">No records found.</td></tr>
            )}
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
            <button onClick={() => setActiveTab('catalogo')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'catalogo' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Tags className="w-5 h-5" /> Catálogo de Prod.
            </button>
            <button onClick={() => setActiveTab('ingreso')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'ingreso' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <TrendingDown className="w-5 h-5" /> Registrar Ingreso
            </button>
            <button onClick={() => setActiveTab('salida')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'salida' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <TrendingUp className="w-5 h-5" /> Registrar Venta
            </button>
            <button onClick={() => setActiveTab('reporte')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeTab === 'reporte' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <BarChart3 className="w-5 h-5" /> Historial / Edición
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
        
        {/* Header Superior Derecho */}
        <div className="absolute top-6 right-8 flex items-center gap-6 z-10">
          {userRole === 'invitado' && (
             <button onClick={() => { setUserRole(null); setLoginForm({username: '', password: ''}) }} className="text-sm font-medium text-red-600 flex items-center gap-2 hover:underline bg-white px-3 py-1 rounded shadow">
               <LogOut className="w-4 h-4" /> Salir
             </button>
          )}

          {userRole === 'admin' && (
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
              <span className="text-sm font-medium text-gray-600">
                {isKoreaView ? 'Regresar a Admin' : 'Vista Socios Corea'}
              </span>
              <button 
                onClick={() => setIsKoreaView(!isKoreaView)}
                className={`w-12 h-6 rounded-full flex items-center transition-colors p-1 ${isKoreaView ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${isKoreaView ? 'translate-x-6' : ''}`}></div>
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
                      className="text-sm border-none bg-transparent outline-none font-medium text-gray-700 cursor-pointer max-w-[150px]"
                      value={exportCategory}
                      onChange={(e) => setExportCategory(e.target.value)}
                    >
                      <option value="Todas">Todo el Inventario</option>
                      {categoriasUnicas.map(cat => (
                        <option key={cat} value={cat}>Solo {cat}</option>
                      ))}
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
                      {stockCalculado.length === 0 && (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">El inventario está vacío. Empieza añadiendo productos en el Catálogo.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VISTA CATÁLOGO DE PRODUCTOS */}
            {activeTab === 'catalogo' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="mb-6 pb-4 border-b">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Tags className="text-indigo-600" /> Catálogo Maestro de Productos
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Añade o elimina productos. Solo los productos aquí registrados aparecerán en tus formularios de ingreso y salida.</p>
                </div>
                
                <form onSubmit={handleGuardarProducto} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-gray-50 p-4 rounded-lg border">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">SKU (Código único)</label>
                    <input required value={formProducto.sku} onChange={e => setFormProducto({...formProducto, sku: e.target.value})} className="w-full border p-2 rounded outline-none uppercase" placeholder="Ej: ALB-BTS-02" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del Producto</label>
                    <input required value={formProducto.nombre} onChange={e => setFormProducto({...formProducto, nombre: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="Ej: Album Map of The Soul" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
                    <input required value={formProducto.categoria} onChange={e => setFormProducto({...formProducto, categoria: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="Ej: Álbumes, Ropa, Tecnología..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Marca / Grupo</label>
                    <input required value={formProducto.marca} onChange={e => setFormProducto({...formProducto, marca: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="Ej: BTS, Apple, Etude..." />
                  </div>
                  <div className="md:col-span-4 flex justify-end mt-2">
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">Añadir al Catálogo</button>
                  </div>
                </form>

                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full text-sm text-left bg-white">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3">Categoría</th>
                        <th className="p-3">Marca</th>
                        <th className="p-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.map(p => (
                        <tr key={p.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-mono font-medium text-indigo-600">{p.sku}</td>
                          <td className="p-3 font-medium">{p.nombre}</td>
                          <td className="p-3">
                            <span className="px-2 py-1 bg-gray-200 rounded-full text-xs font-medium">{p.categoria}</span>
                          </td>
                          <td className="p-3 text-gray-500">{p.marca}</td>
                          <td className="p-3 flex justify-end">
                            <button onClick={() => handleDelete('productos', p.id)} className="text-red-500 hover:bg-red-100 p-2 rounded transition-colors" title="Eliminar del catálogo"><Trash2 className="w-4 h-4"/></button>
                          </td>
                        </tr>
                      ))}
                      {productos.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-gray-400">El catálogo está vacío. Añade tu primer producto en el formulario de arriba.</td></tr>}
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
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ID de Lote / Importación</label>
                      <input value={formIngreso.loteId} onChange={e => setFormIngreso({...formIngreso, loteId: e.target.value})} className="w-full border p-2 rounded outline-none uppercase" placeholder="Ej: STOCK-INICIAL" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Producto (SKU)</label>
                      <select required value={formIngreso.sku} onChange={e => setFormIngreso({...formIngreso, sku: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option value="">Selecciona del catálogo...</option>
                        {productos.map(p => <option key={p.id} value={p.sku}>{p.sku} - {p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                      <input required type="number" min="1" value={formIngreso.cantidad} onChange={e => setFormIngreso({...formIngreso, cantidad: e.target.value})} className="w-full border p-2 rounded outline-none" />
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                    <h3 className="font-bold flex items-center gap-2 text-gray-700"><Calculator className="w-4 h-4"/> Costos (S/) <span className="text-xs font-normal text-gray-500">- Opcional</span></h3>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Costo FOB Total</label>
                      <input type="number" step="0.01" value={formIngreso.costoFob} onChange={e => setFormIngreso({...formIngreso, costoFob: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="0.00" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Flete Internacional</label>
                        <input type="number" step="0.01" value={formIngreso.flete} onChange={e => setFormIngreso({...formIngreso, flete: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="0.00" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Aduanas</label>
                        <input type="number" step="0.01" value={formIngreso.aduanas} onChange={e => setFormIngreso({...formIngreso, aduanas: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="0.00" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">IGV Pagado</label>
                      <input type="number" step="0.01" value={formIngreso.igv} onChange={e => setFormIngreso({...formIngreso, igv: e.target.value})} className="w-full border p-2 rounded outline-none bg-white" placeholder="0.00" />
                    </div>
                  </div>
                  <div className="md:col-span-2 flex justify-end mt-4">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">Guardar Lote de Ingreso</button>
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
                        <option value="">Selecciona del stock disponible...</option>
                        {stockCalculado.map(p => <option key={p.sku} value={p.sku} disabled={p.stockActual <= 0}>{p.sku} - {p.nombre} (Stock: {p.stockActual})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                        <input required type="number" min="1" value={formSalida.cantidad} onChange={e => setFormSalida({...formSalida, cantidad: e.target.value})} className="w-full border p-2 rounded outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Precio Total (Opcional)</label>
                        <input type="number" step="0.01" value={formSalida.precioTotal} onChange={e => setFormSalida({...formSalida, precioTotal: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="S/ 0.00" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Canal de Venta</label>
                      <select value={formSalida.canalVenta} onChange={e => setFormSalida({...formSalida, canalVenta: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option value="">Sin especificar</option>
                        <option>Instagram</option>
                        <option>WhatsApp</option>
                        <option>Feria K-Pop</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                    <h3 className="font-bold flex items-center gap-2 text-gray-700"><ShieldCheck className="w-4 h-4"/> Datos de Pago <span className="text-xs font-normal text-gray-500">- Opcional</span></h3>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Método de Pago</label>
                      <select value={formSalida.metodoPago} onChange={e => setFormSalida({...formSalida, metodoPago: e.target.value})} className="w-full border p-2 rounded outline-none">
                        <option value="">Sin especificar</option>
                        <option>Yape / Plin</option>
                        <option>Transferencia BCP</option>
                        <option>Efectivo</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Comprobante</label>
                        <select value={formSalida.comprobante} onChange={e => setFormSalida({...formSalida, comprobante: e.target.value})} className="w-full border p-2 rounded outline-none">
                          <option value="">Sin especificar</option>
                          <option>Boleta</option>
                          <option>Factura</option>
                          <option>Nota de Venta</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">DNI / RUC</label>
                        <input type="text" value={formSalida.documentoCliente} onChange={e => setFormSalida({...formSalida, documentoCliente: e.target.value})} className="w-full border p-2 rounded outline-none" placeholder="Opcional" />
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-2 flex justify-end mt-4">
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">Registrar Venta</button>
                  </div>
                </form>
              </div>
            )}

            {/* VISTA REPORTES (Historial) */}
            {activeTab === 'reporte' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                  <BarChart3 className="text-purple-600" /> Historial de Registros
                </h2>
                <p className="text-sm text-gray-500 mb-6">Administra tus últimos registros de stock. Puedes editarlos o eliminarlos en caso de error y el inventario se ajustará solo.</p>
                
                <div className="space-y-8">
                  {/* TABLA VENTAS */}
                  <div>
                    <h3 className="font-bold text-sm text-gray-500 uppercase mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500"/> Ventas y Salidas</h3>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="min-w-full text-xs text-left bg-white">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="p-3">Fecha</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3">Cant</th>
                            <th className="p-3">Total (S/)</th>
                            <th className="p-3 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salidas.map(s => (
                            <tr key={s.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 text-gray-500">{s.createdAt?.toDate().toLocaleDateString() || 'Nuevo'}</td>
                              <td className="p-3 font-medium">{s.sku}</td>
                              <td className="p-3">{s.cantidad}</td>
                              <td className="p-3 text-green-600 font-bold">{s.precioTotal || '0'}</td>
                              <td className="p-3 flex justify-end gap-2">
                                <button onClick={() => setEditingItem({ type: 'salidas', id: s.id, data: s })} className="text-blue-500 hover:bg-blue-100 p-1 rounded transition-colors" title="Editar"><Edit2 className="w-4 h-4"/></button>
                                <button onClick={() => handleDelete('salidas', s.id)} className="text-red-500 hover:bg-red-100 p-1 rounded transition-colors" title="Eliminar"><Trash2 className="w-4 h-4"/></button>
                              </td>
                            </tr>
                          ))}
                          {salidas.length === 0 && <tr><td colSpan="5" className="p-4 text-center text-gray-400">No hay ventas registradas</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* TABLA INGRESOS */}
                  <div>
                    <h3 className="font-bold text-sm text-gray-500 uppercase mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-blue-500"/> Ingresos de Lotes</h3>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="min-w-full text-xs text-left bg-white">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="p-3">Lote ID</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3">Cant</th>
                            <th className="p-3">Costo Total</th>
                            <th className="p-3 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ingresos.map(i => (
                            <tr key={i.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 font-mono text-gray-600">{i.loteId || 'S/N'}</td>
                              <td className="p-3 font-medium">{i.sku}</td>
                              <td className="p-3">{i.cantidad}</td>
                              <td className="p-3 text-gray-600">S/ {i.costoTotalLote?.toFixed(2) || '0.00'}</td>
                              <td className="p-3 flex justify-end gap-2">
                                <button onClick={() => setEditingItem({ type: 'ingresos', id: i.id, data: i })} className="text-blue-500 hover:bg-blue-100 p-1 rounded transition-colors" title="Editar"><Edit2 className="w-4 h-4"/></button>
                                <button onClick={() => handleDelete('ingresos', i.id)} className="text-red-500 hover:bg-red-100 p-1 rounded transition-colors" title="Eliminar"><Trash2 className="w-4 h-4"/></button>
                              </td>
                            </tr>
                          ))}
                          {ingresos.length === 0 && <tr><td colSpan="5" className="p-4 text-center text-gray-400">No hay ingresos registrados</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* --- MODAL DE EDICIÓN FLOTANTE --- */}
        {editingItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
              <button onClick={() => setEditingItem(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 transition-colors">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" /> Editar {editingItem.type === 'ingresos' ? 'Ingreso' : 'Venta'}
              </h2>
              
              <form onSubmit={handleUpdateItem} className="space-y-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
                    <input required type="number" min="1" value={editingItem.data.cantidad} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, cantidad: e.target.value } })} className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  {editingItem.type === 'salidas' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Precio Total (S/)</label>
                      <input type="number" step="0.01" value={editingItem.data.precioTotal || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, precioTotal: e.target.value } })} className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  )}
                  {editingItem.type === 'ingresos' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">ID de Lote</label>
                      <input value={editingItem.data.loteId || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, loteId: e.target.value } })} className="w-full border p-2 rounded outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  )}
                </div>

                {editingItem.type === 'ingresos' && (
                  <div className="bg-gray-50 p-4 rounded-lg border grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Costo FOB</label>
                      <input type="number" step="0.01" value={editingItem.data.costoFob || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, costoFob: e.target.value } })} className="w-full border p-2 rounded outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Flete</label>
                      <input type="number" step="0.01" value={editingItem.data.flete || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, flete: e.target.value } })} className="w-full border p-2 rounded outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Aduanas</label>
                      <input type="number" step="0.01" value={editingItem.data.aduanas || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, aduanas: e.target.value } })} className="w-full border p-2 rounded outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">IGV</label>
                      <input type="number" step="0.01" value={editingItem.data.igv || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, igv: e.target.value } })} className="w-full border p-2 rounded outline-none" />
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end pt-4 border-t mt-4">
                  <button type="button" onClick={() => setEditingItem(null)} className="mr-3 px-4 py-2 text-gray-500 hover:text-gray-800 transition-colors">Cancelar</button>
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">Guardar Cambios</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
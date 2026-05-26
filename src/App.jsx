import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Package, TrendingDown, TrendingUp, BarChart3, Globe2, ShieldCheck, Calculator, Download, LogOut, Lock, Edit2, Trash2, X, Tags, Menu, Search, Info } from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
let app, auth, db, appId;
try {
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
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
  
  // --- SISTEMA DE ROLES Y LOGIN POR CORREO ---
  const [userRole, setUserRole] = useState(null); // 'admin' | 'invitado' | null
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  
  // --- UI STATES ---
  const [activeTab, setActiveTab] = useState('stock');
  const [isKoreaView, setIsKoreaView] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Para móviles
  const [searchTerm, setSearchTerm] = useState(''); // Buscador inteligente
  const [exportCategory, setExportCategory] = useState('Todas');
  
  // --- DATA STATES ---
  const [productos, setProductos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [notification, setNotification] = useState('');

  // --- FORM STATES ---
  const [formProducto, setFormProducto] = useState({ nombre: '', categoriaSelect: '', categoriaNueva: '', marcaSelect: '', marcaNueva: '' });
  const [formIngreso, setFormIngreso] = useState({
    loteSelect: '', loteNuevo: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: ''
  });
  const [formSalida, setFormSalida] = useState({
    sku: '', cantidad: '', precioTotal: '', canalVenta: '', metodoPago: '', comprobante: '', documentoCliente: ''
  });
  const [editingItem, setEditingItem] = useState(null);

  // --- 1. AUTENTICACIÓN FIREBASE OFICIAL ---
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        if (user.email === 'socios@casaseoul.com' || user.email?.includes('invitado')) {
          setUserRole('invitado');
          setIsKoreaView(true);
        } else {
          setUserRole('admin');
          setActiveTab('stock');
          setIsKoreaView(false);
        }
      } else {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. OBTENER DATOS (PÚBLICOS PARA EL EQUIPO) ---
  useEffect(() => {
    if (!firebaseUser || !db) return;

    const productosRef = collection(db, 'artifacts', appId, 'public', 'data', 'productos');
    const unsubProductos = onSnapshot(productosRef, (snapshot) => {
      setProductos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error(error));

    const ingresosRef = collection(db, 'artifacts', appId, 'public', 'data', 'ingresos');
    const unsubIngresos = onSnapshot(ingresosRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setIngresos(data);
    }, (error) => console.error(error));

    const salidasRef = collection(db, 'artifacts', appId, 'public', 'data', 'salidas');
    const unsubSalidas = onSnapshot(salidasRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setSalidas(data);
    }, (error) => console.error(error));

    return () => { unsubProductos(); unsubIngresos(); unsubSalidas(); };
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

    let finalStock = Object.values(stockMap);
    if (userRole === 'invitado') {
      finalStock = finalStock.filter(item => item.categoria !== 'Tecnología');
    }
    return finalStock;
  }, [ingresos, salidas, userRole, productos]);

  // Filtro de Búsqueda Inteligente
  const stockFiltrado = useMemo(() => {
    if (!searchTerm) return stockCalculado;
    return stockCalculado.filter(item => 
      item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.marca.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [stockCalculado, searchTerm]);

  const categoriasUnicas = useMemo(() => Array.from(new Set(productos.map(p => p.categoria))), [productos]);
  const marcasUnicas = useMemo(() => Array.from(new Set(productos.map(p => p.marca))), [productos]);
  const lotesUnicos = useMemo(() => Array.from(new Set(ingresos.map(i => i.loteId).filter(Boolean))), [ingresos]);

  // --- 4. EXPORTAR A CSV ---
  const handleExportCSV = () => {
    let dataToExport = stockCalculado;
    if (exportCategory !== 'Todas') {
      dataToExport = dataToExport.filter(item => item.categoria === exportCategory);
    }
    const headers = ['SKU', 'Producto', 'Categoria', 'Marca', 'Ingresos', 'Salidas', 'Stock_Actual', 'Costo_Promedio_Soles'];
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(item => `"${item.sku}","${item.nombre}","${item.categoria}","${item.marca}",${item.totalIngresos},${item.totalSalidas},${item.stockActual},${item.costoPromedio.toFixed(2)}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `CasaSeoul_Inventario_${exportCategory}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- LOGIN Y RUTEO ---
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
    } catch (error) {
      setNotification('❌ Correo o contraseña incorrectos');
      setTimeout(() => setNotification(''), 3000);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); setLoginForm({ email: '', password: '' }); } catch (error) { console.error(error); }
  };

  // Función para cerrar el menú en móviles al seleccionar una pestaña
  const changeTab = (tab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  // --- ACCIONES DE GUARDADO (Admin) ---
  const showNotif = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  const handleGuardarProducto = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db) return;
    if (userRole !== 'admin') return showNotif('❌ No tienes permisos');

    const finalCategoria = formProducto.categoriaSelect === '+ Nueva Categoría' ? formProducto.categoriaNueva.trim() : formProducto.categoriaSelect;
    const finalMarca = formProducto.marcaSelect === '+ Nueva Marca' ? formProducto.marcaNueva.trim() : formProducto.marcaSelect;

    if (!finalCategoria || !finalMarca || !formProducto.nombre.trim()) return showNotif('❌ Completa todos los campos principales');

    const prefixCat = finalCategoria.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(3, 'X');
    const prefixMar = finalMarca.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(3, 'X');
    const basePrefix = `${prefixCat}-${prefixMar}`;

    const matchingProducts = productos.filter(p => p.sku && p.sku.startsWith(basePrefix));
    let nextNumber = matchingProducts.length + 1;
    let skuGenerado = `${basePrefix}-${String(nextNumber).padStart(3, '0')}`;

    while (productos.some(p => p.sku === skuGenerado)) {
      nextNumber++;
      skuGenerado = `${basePrefix}-${String(nextNumber).padStart(3, '0')}`;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'productos'), {
        nombre: formProducto.nombre.trim(), categoria: finalCategoria, marca: finalMarca, sku: skuGenerado, createdAt: serverTimestamp()
      });
      showNotif(`✅ Producto añadido. SKU asignado: ${skuGenerado}`);
      setFormProducto({ nombre: '', categoriaSelect: '', categoriaNueva: '', marcaSelect: '', marcaNueva: '' });
    } catch (error) { showNotif('❌ Error al guardar producto'); }
  };

  const handleGuardarIngreso = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || userRole !== 'admin') return;

    const finalLoteId = formIngreso.loteSelect === '+ Nuevo Lote' ? formIngreso.loteNuevo.trim().toUpperCase() : formIngreso.loteSelect;
    if (!finalLoteId) return showNotif('❌ Selecciona o escribe un ID de Lote');

    const cFob = Number(formIngreso.costoFob || 0);
    const cFlete = Number(formIngreso.flete || 0);
    const cAduanas = Number(formIngreso.aduanas || 0);
    const qty = Number(formIngreso.cantidad || 1);
    
    const costoTotalLote = cFob + cFlete + cAduanas;
    const costoUnitarioReal = costoTotalLote / qty;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'ingresos'), {
        loteId: finalLoteId, sku: formIngreso.sku, cantidad: formIngreso.cantidad,
        costoFob: formIngreso.costoFob, flete: formIngreso.flete, aduanas: formIngreso.aduanas, igv: formIngreso.igv,
        costoTotalLote, costoUnitarioReal, createdAt: serverTimestamp()
      });
      showNotif('✅ Ingreso registrado con éxito');
      setFormIngreso({ loteSelect: finalLoteId, loteNuevo: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: '' });
    } catch (error) { showNotif('❌ Error al guardar ingreso'); }
  };

  const handleGuardarSalida = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || userRole !== 'admin') return;

    const itemStock = stockCalculado.find(s => s.sku === formSalida.sku);
    if (!itemStock || itemStock.stockActual < Number(formSalida.cantidad)) return showNotif('❌ Stock insuficiente para esta venta');

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'salidas'), { ...formSalida, createdAt: serverTimestamp() });
      showNotif('✅ Venta registrada con éxito');
      setFormSalida({ sku: '', cantidad: '', precioTotal: '', canalVenta: '', metodoPago: '', comprobante: '', documentoCliente: '' });
    } catch (error) { showNotif('❌ Error al registrar venta'); }
  };

  const handleDelete = async (coleccion, id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este registro? El stock se recalculará automáticamente.')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coleccion, id));
      showNotif('✅ Registro eliminado');
    } catch (error) { showNotif('❌ Error al eliminar'); }
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
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', editingItem.type, editingItem.id), updatedData);
      showNotif('✅ Registro actualizado');
      setEditingItem(null);
    } catch (error) { showNotif('❌ Error al actualizar'); }
  };

  // ==========================================
  // PANTALLA DE LOGIN
  // ==========================================
  if (!userRole) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200 transform rotate-3">
              <Lock className="w-10 h-10 text-white transform -rotate-3" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900">CASA SEOUL</h1>
            <p className="text-slate-500 text-sm mt-2 uppercase tracking-widest font-medium">Team Access</p>
          </div>

          {notification && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium text-center flex items-center justify-center gap-2">
              {notification}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Correo Electrónico</label>
              <input type="email" required placeholder="ejemplo@casaseoul.com" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-indigo-600 focus:bg-white transition-all text-slate-800 font-medium" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Contraseña</label>
              <input type="password" required placeholder="••••••••" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-indigo-600 focus:bg-white transition-all text-slate-800 font-medium" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]">
              Iniciar Sesión Segura
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Korea Dashboard</h2>
          <p className="text-slate-500 mt-1">Live Inventory Status - Seoul HQ</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-xl">
          <Globe2 className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-bold">
              <th className="p-5 border-b">SKU / Item ID</th>
              <th className="p-5 border-b">Product Name</th>
              <th className="p-5 border-b">Category</th>
              <th className="p-5 border-b text-right">Current Stock</th>
              <th className="p-5 border-b text-center">Status</th>
            </tr>
          </thead>
          <tbody className="text-slate-700 divide-y divide-slate-100 bg-white">
            {stockFiltrado.map(item => (
              <tr key={item.sku} className="hover:bg-slate-50 transition-colors group">
                <td className="p-5 font-mono text-sm font-medium text-slate-500 group-hover:text-indigo-600 transition-colors">{item.sku}</td>
                <td className="p-5 font-bold">{item.nombre} <span className="block font-normal text-xs text-slate-400 mt-1">{item.marca}</span></td>
                <td className="p-5"><span className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-medium">{item.categoria}</span></td>
                <td className="p-5 font-black text-xl text-right">{item.stockActual}</td>
                <td className="p-5 text-center">
                  {item.stockActual <= 5 ? (
                    <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100">REORDER</span>
                  ) : (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold border border-emerald-100">IN STOCK</span>
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
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 overflow-hidden">
      
      {/* CAPA OSCURA MÓVIL */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      {userRole === 'admin' && !isKoreaView && (
        <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none`}>
          <div className="p-6 md:p-8 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">CASA SEOUL</h1>
              <p className="text-xs text-indigo-400 mt-1 uppercase tracking-widest font-bold">Workspace</p>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
          </div>
          
          <nav className="flex-1 px-4 space-y-2 mt-2 overflow-y-auto">
            <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 mt-2">Menú Principal</p>
            {[
              { id: 'stock', icon: Package, label: 'Inventario Maestro' },
              { id: 'catalogo', icon: Tags, label: 'Catálogo de Prod.' },
              { id: 'ingreso', icon: TrendingDown, label: 'Registrar Ingreso' },
              { id: 'salida', icon: TrendingUp, label: 'Registrar Venta' },
              { id: 'reporte', icon: BarChart3, label: 'Historial / Edición' },
            ].map(item => (
              <button key={item.id} onClick={() => changeTab(item.id)} className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl text-sm font-medium transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-indigo-200' : ''}`} /> {item.label}
              </button>
            ))}
          </nav>
          
          <div className="p-6 border-t border-slate-800">
             <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 text-sm font-medium text-slate-300 hover:bg-red-500 hover:text-white transition-colors">
               <LogOut className="w-4 h-4" /> Cerrar Sesión
             </button>
          </div>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* HEADER RESPONSIVO */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10 sticky top-0 shadow-sm">
          <div className="flex items-center gap-4">
            {userRole === 'admin' && !isKoreaView && (
              <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                <Menu className="w-6 h-6" />
              </button>
            )}
            <h2 className="font-bold text-slate-800 hidden sm:block">
              {userRole === 'invitado' || isKoreaView ? 'Seoul Headquarters' : 'Panel de Administración'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {userRole === 'invitado' && (
               <button onClick={handleLogout} className="text-sm font-bold text-red-600 flex items-center gap-2 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors border border-red-100">
                 <LogOut className="w-4 h-4" /> Salir
               </button>
            )}

            {userRole === 'admin' && (
              <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide hidden sm:block">
                  {isKoreaView ? 'Volver a Admin' : 'Simular Vista Corea'}
                </span>
                <button onClick={() => { setIsKoreaView(!isKoreaView); setIsSidebarOpen(false); }} className={`w-12 h-6 rounded-full flex items-center transition-colors p-1 ${isKoreaView ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isKoreaView ? 'translate-x-6' : ''}`}></div>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ÁREA DE TRABAJO SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          
          {/* NOTIFICACIÓN FLOTANTE */}
          {notification && (
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl font-bold z-50 flex items-center gap-3 animate-bounce">
              {notification}
            </div>
          )}

          {(isKoreaView || userRole === 'invitado') ? (
            <div className="max-w-6xl mx-auto">{renderVistaCorea()}</div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-6 pb-20">
              
              {/* --- VISTA STOCK --- */}
              {activeTab === 'stock' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 border-b pb-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <Package className="text-indigo-600 w-8 h-8" /> Inventario Maestro
                      </h2>
                      <p className="text-slate-500 text-sm mt-2">Visión general del stock actual y valorización.</p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-stretch gap-4 w-full lg:w-auto">
                      {/* BUSCADOR */}
                      <div className="relative flex-1 sm:min-w-[250px]">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Buscar producto o SKU..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                      
                      {/* EXPORTAR */}
                      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shrink-0">
                        <select className="text-sm border-none bg-transparent outline-none font-bold text-slate-600 cursor-pointer pl-2" value={exportCategory} onChange={(e) => setExportCategory(e.target.value)}>
                          <option value="Todas">Todo el Inventario</option>
                          {categoriasUnicas.map(cat => <option key={cat} value={cat}>Solo {cat}</option>)}
                        </select>
                        <button onClick={handleExportCSV} className="ml-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-md transition-colors flex items-center justify-center" title="Descargar CSV">
                          <Download className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100">
                          <th className="p-4 md:p-5">SKU</th>
                          <th className="p-4 md:p-5">Producto</th>
                          <th className="p-4 md:p-5 text-center">Ingresos</th>
                          <th className="p-4 md:p-5 text-center">Salidas</th>
                          <th className="p-4 md:p-5 text-right text-indigo-600">Stock Real</th>
                          <th className="p-4 md:p-5 text-right">Costo Promedio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {stockFiltrado.map(item => (
                          <tr key={item.sku} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 md:p-5 font-mono font-bold text-slate-500">{item.sku}</td>
                            <td className="p-4 md:p-5">
                              <span className="font-bold text-slate-800 block">{item.nombre}</span>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-100 rounded text-slate-500">{item.marca}</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-50 rounded text-indigo-500">{item.categoria}</span>
                              </div>
                            </td>
                            <td className="p-4 md:p-5 text-center text-blue-600 font-bold bg-blue-50/30">{item.totalIngresos}</td>
                            <td className="p-4 md:p-5 text-center text-orange-500 font-bold bg-orange-50/30">{item.totalSalidas}</td>
                            <td className="p-4 md:p-5 text-right font-black text-xl">
                              <span className={item.stockActual <= 5 ? 'text-red-500 bg-red-50 px-3 py-1 rounded-lg' : 'text-emerald-600'}>
                                {item.stockActual}
                              </span>
                            </td>
                            <td className="p-4 md:p-5 text-right text-slate-600 font-bold">S/ {item.costoPromedio.toFixed(2)}</td>
                          </tr>
                        ))}
                        {stockFiltrado.length === 0 && (
                          <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-medium">No se encontraron productos.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- VISTA CATÁLOGO --- */}
              {activeTab === 'catalogo' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                      <Tags className="text-indigo-600 w-8 h-8" /> Catálogo Maestro
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">Crea las "fichas de identidad" de tus productos aquí antes de ingresar stock.</p>
                  </div>
                  
                  {/* ONBOARDING TIP */}
                  <div className="mb-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start text-sm text-blue-800">
                    <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
                    <div><strong className="block mb-1">💡 Tip para el equipo: Auto-SKU</strong>No necesitas inventar códigos. Escribe el nombre, elige una marca y el sistema le asignará un código único automáticamente (Ej. ALB-BTS-001).</div>
                  </div>

                  <form onSubmit={handleGuardarProducto} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre del Producto</label>
                      <input required value={formProducto.nombre} onChange={e => setFormProducto({...formProducto, nombre: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium" placeholder="Ej: Album Map of The Soul" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Categoría</label>
                      <select required value={formProducto.categoriaSelect} onChange={e => setFormProducto({...formProducto, categoriaSelect: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium mb-2">
                        <option value="">Selecciona...</option>
                        {categoriasUnicas.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        <option value="+ Nueva Categoría" className="font-bold text-indigo-600">+ Añadir nueva categoría...</option>
                      </select>
                      {formProducto.categoriaSelect === '+ Nueva Categoría' && (
                        <input required autoFocus value={formProducto.categoriaNueva} onChange={e => setFormProducto({...formProducto, categoriaNueva: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="Escribe la nueva categoría" />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Marca / Grupo</label>
                      <select required value={formProducto.marcaSelect} onChange={e => setFormProducto({...formProducto, marcaSelect: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium mb-2">
                        <option value="">Selecciona...</option>
                        {marcasUnicas.map(marca => <option key={marca} value={marca}>{marca}</option>)}
                        <option value="+ Nueva Marca" className="font-bold text-indigo-600">+ Añadir nueva marca...</option>
                      </select>
                      {formProducto.marcaSelect === '+ Nueva Marca' && (
                        <input required autoFocus value={formProducto.marcaNueva} onChange={e => setFormProducto({...formProducto, marcaNueva: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="Escribe la nueva marca" />
                      )}
                    </div>
                    <div className="md:col-span-3 flex justify-end mt-2">
                      <button type="submit" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-md active:scale-95">Guardar y Generar SKU</button>
                    </div>
                  </form>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100">
                        <tr>
                          <th className="p-4">SKU</th>
                          <th className="p-4">Producto</th>
                          <th className="p-4">Categoría</th>
                          <th className="p-4">Marca</th>
                          <th className="p-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productos.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono font-bold text-indigo-600">{p.sku}</td>
                            <td className="p-4 font-bold text-slate-700">{p.nombre}</td>
                            <td className="p-4"><span className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-500">{p.categoria}</span></td>
                            <td className="p-4 text-slate-500 font-medium">{p.marca}</td>
                            <td className="p-4 text-right">
                              <button onClick={() => handleDelete('productos', p.id)} className="text-red-500 hover:bg-red-100 p-2 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-5 h-5"/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- VISTA INGRESO --- */}
              {activeTab === 'ingreso' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                      <TrendingDown className="text-blue-600 w-8 h-8" /> Ingresar Stock
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">Registra nueva mercadería. Si es una importación grande, agrupa los productos bajo un mismo "Lote".</p>
                  </div>
                  
                  {/* ONBOARDING TIP */}
                  <div className="mb-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start text-sm text-blue-800">
                    <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
                    <div><strong className="block mb-1">💡 Lotes Persistentes</strong>Al guardar un producto, el "ID de Lote" se quedará seleccionado para que puedas meter el siguiente producto rapidísimo sin volver a escribir el lote. Además, los costos son 100% opcionales.</div>
                  </div>

                  <form onSubmit={handleGuardarIngreso} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">ID de Lote / Importación</label>
                        <select required value={formIngreso.loteSelect} onChange={e => setFormIngreso({...formIngreso, loteSelect: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium">
                          <option value="">Selecciona un lote previo...</option>
                          {lotesUnicos.map(lote => <option key={lote} value={lote}>{lote}</option>)}
                          <option value="+ Nuevo Lote" className="font-bold text-blue-600">+ Crear nuevo lote...</option>
                        </select>
                        {formIngreso.loteSelect === '+ Nuevo Lote' && (
                          <input required autoFocus value={formIngreso.loteNuevo} onChange={e => setFormIngreso({...formIngreso, loteNuevo: e.target.value})} className="w-full mt-3 px-4 py-3 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-bold uppercase placeholder-slate-300" placeholder="Ej: IMP-COREA-05" />
                        )}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Producto del Catálogo</label>
                          <select required value={formIngreso.sku} onChange={e => setFormIngreso({...formIngreso, sku: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium">
                            <option value="">Buscar SKU...</option>
                            {productos.map(p => <option key={p.id} value={p.sku}>{p.sku} - {p.nombre}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cantidad</label>
                          <input required type="number" min="1" value={formIngreso.cantidad} onChange={e => setFormIngreso({...formIngreso, cantidad: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-black text-center text-lg text-blue-600" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-5">
                      <h3 className="font-black flex items-center gap-2 text-slate-700 uppercase tracking-wide text-sm border-b pb-3"><Calculator className="w-5 h-5 text-slate-400"/> Panel de Costos <span className="text-xs font-normal bg-slate-200 px-2 py-1 rounded text-slate-500 ml-auto">(Opcional)</span></h3>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Costo Total Prorrateado (S/)</label>
                        <input type="number" step="0.01" value={formIngreso.costoFob} onChange={e => setFormIngreso({...formIngreso, costoFob: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium" placeholder="0.00" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Flete</label>
                          <input type="number" step="0.01" value={formIngreso.flete} onChange={e => setFormIngreso({...formIngreso, flete: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium" placeholder="0.00" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Aduanas / IGV</label>
                          <input type="number" step="0.01" value={formIngreso.aduanas} onChange={e => setFormIngreso({...formIngreso, aduanas: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium" placeholder="0.00" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="md:col-span-2 flex justify-end mt-2 pt-6 border-t">
                      <button type="submit" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-xl font-black text-lg transition-all shadow-md active:scale-95">Sumar Stock al Inventario</button>
                    </div>
                  </form>
                </div>
              )}

              {/* --- VISTA SALIDA --- */}
              {activeTab === 'salida' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                      <TrendingUp className="text-emerald-500 w-8 h-8" /> Registrar Venta
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">Deduce productos del inventario rápidamente al realizar una venta física o digital.</p>
                  </div>

                  <form onSubmit={handleGuardarSalida} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">¿Qué se vendió?</label>
                        <select required value={formSalida.sku} onChange={e => setFormSalida({...formSalida, sku: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium">
                          <option value="">Selecciona del stock disponible...</option>
                          {stockCalculado.map(p => <option key={p.sku} value={p.sku} disabled={p.stockActual <= 0}>{p.sku} - {p.nombre} (Disponibles: {p.stockActual})</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unidades</label>
                          <input required type="number" min="1" value={formSalida.cantidad} onChange={e => setFormSalida({...formSalida, cantidad: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-black text-center text-lg text-emerald-600" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cobro (S/)</label>
                          <input type="number" step="0.01" value={formSalida.precioTotal} onChange={e => setFormSalida({...formSalida, precioTotal: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium" placeholder="Opcional" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Canal / Lugar</label>
                        <select value={formSalida.canalVenta} onChange={e => setFormSalida({...formSalida, canalVenta: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium">
                          <option value="">No especificar</option><option>Instagram</option><option>WhatsApp</option><option>Feria K-Pop</option><option>Tienda Física</option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-5">
                      <h3 className="font-black flex items-center gap-2 text-slate-700 uppercase tracking-wide text-sm border-b pb-3"><ShieldCheck className="w-5 h-5 text-slate-400"/> Datos del Cliente <span className="text-xs font-normal bg-slate-200 px-2 py-1 rounded text-slate-500 ml-auto">(Opcional)</span></h3>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Método de Pago</label>
                        <select value={formSalida.metodoPago} onChange={e => setFormSalida({...formSalida, metodoPago: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium">
                          <option value="">No especificar</option><option>Yape / Plin</option><option>Transferencia BCP</option><option>Efectivo</option><option>Tarjeta</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Comprobante</label>
                          <select value={formSalida.comprobante} onChange={e => setFormSalida({...formSalida, comprobante: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium">
                            <option value="">Ninguno</option><option>Boleta</option><option>Factura</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">DNI / Nombre</label>
                          <input type="text" value={formSalida.documentoCliente} onChange={e => setFormSalida({...formSalida, documentoCliente: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium" placeholder="Info rápida" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="md:col-span-2 flex justify-end mt-2 pt-6 border-t">
                      <button type="submit" className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-lg transition-all shadow-md active:scale-95">Confirmar Salida</button>
                    </div>
                  </form>
                </div>
              )}

              {/* --- VISTA HISTORIAL --- */}
              {activeTab === 'reporte' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                      <BarChart3 className="text-purple-600 w-8 h-8" /> Historial y Correcciones
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">¿Pusiste un número mal? Busca el registro aquí, edítalo o elimínalo. El stock maestro se arreglará solo.</p>
                  </div>
                  
                  <div className="space-y-12">
                    {/* TABLA INGRESOS */}
                    <div>
                      <h3 className="font-black text-sm text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-blue-500"/> Últimos Ingresos (Lotes)</h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="min-w-full text-sm text-left whitespace-nowrap">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100">
                            <tr>
                              <th className="p-4">Lote ID</th>
                              <th className="p-4">SKU</th>
                              <th className="p-4 text-center">Cant</th>
                              <th className="p-4">Costo Ref.</th>
                              <th className="p-4 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {ingresos.map(i => (
                              <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-mono font-bold text-slate-500">{i.loteId || 'S/N'}</td>
                                <td className="p-4 font-bold text-slate-700">{i.sku}</td>
                                <td className="p-4 text-center font-bold text-blue-600 bg-blue-50/50">{i.cantidad}</td>
                                <td className="p-4 text-slate-500 font-medium">S/ {i.costoTotalLote?.toFixed(2) || '0.00'}</td>
                                <td className="p-4 flex justify-end gap-2">
                                  <button onClick={() => setEditingItem({ type: 'ingresos', id: i.id, data: i })} className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 className="w-5 h-5"/></button>
                                  <button onClick={() => handleDelete('ingresos', i.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 className="w-5 h-5"/></button>
                                </td>
                              </tr>
                            ))}
                            {ingresos.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400 font-medium">No hay ingresos registrados</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* TABLA VENTAS */}
                    <div>
                      <h3 className="font-black text-sm text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-500"/> Últimas Ventas (Salidas)</h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="min-w-full text-sm text-left whitespace-nowrap">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100">
                            <tr>
                              <th className="p-4">Fecha</th>
                              <th className="p-4">SKU</th>
                              <th className="p-4 text-center">Cant</th>
                              <th className="p-4">Total (S/)</th>
                              <th className="p-4 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {salidas.map(s => (
                              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-slate-400 text-xs font-medium">{s.createdAt?.toDate().toLocaleDateString() || 'Hoy'}</td>
                                <td className="p-4 font-bold text-slate-700">{s.sku}</td>
                                <td className="p-4 text-center font-bold text-emerald-600 bg-emerald-50/50">{s.cantidad}</td>
                                <td className="p-4 text-emerald-600 font-black">{s.precioTotal ? `S/ ${s.precioTotal}` : '-'}</td>
                                <td className="p-4 flex justify-end gap-2">
                                  <button onClick={() => setEditingItem({ type: 'salidas', id: s.id, data: s })} className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 className="w-5 h-5"/></button>
                                  <button onClick={() => handleDelete('salidas', s.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 className="w-5 h-5"/></button>
                                </td>
                              </tr>
                            ))}
                            {salidas.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400 font-medium">No hay ventas registradas</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* --- MODAL EDICIÓN FLOTANTE --- */}
          {editingItem && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 md:p-8 relative max-h-[90vh] overflow-y-auto">
                <button onClick={() => setEditingItem(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 transition-colors bg-slate-100 rounded-full p-1"><X className="w-6 h-6" /></button>
                <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                  <Edit2 className="w-6 h-6 text-indigo-600" /> Corregir {editingItem.type === 'ingresos' ? 'Ingreso' : 'Venta'}
                </h2>
                
                <form onSubmit={handleUpdateItem} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unidades (Stock)</label>
                      <input required type="number" min="1" value={editingItem.data.cantidad} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, cantidad: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-600" />
                    </div>
                    {editingItem.type === 'salidas' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Precio Total (S/)</label>
                        <input type="number" step="0.01" value={editingItem.data.precioTotal || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, precioTotal: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                      </div>
                    )}
                    {editingItem.type === 'ingresos' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">ID Lote</label>
                        <input value={editingItem.data.loteId || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, loteId: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm" />
                      </div>
                    )}
                  </div>

                  {editingItem.type === 'ingresos' && (
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">FOB Total</label>
                        <input type="number" step="0.01" value={editingItem.data.costoFob || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, costoFob: e.target.value } })} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Flete / Aduanas</label>
                        <input type="number" step="0.01" value={editingItem.data.flete || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, flete: e.target.value } })} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none" placeholder="Flete" />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-end pt-6">
                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-black text-lg transition-all shadow-md active:scale-95">Guardar Corrección</button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
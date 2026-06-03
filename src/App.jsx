import React, { useState, useEffect, useMemo, useRef } from 'react';
import './index.css';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { Package, TrendingDown, TrendingUp, BarChart3, Globe2, ShieldCheck, Calculator, Download, LogOut, Lock, Edit2, Trash2, X, Tags, Menu, Search, Info, PieChart, Users, Printer, Eye, Camera, UploadCloud, FileText, AlertCircle, Award, Bell, AlertTriangle, ScanLine, Calendar, Settings, ToggleRight, ToggleLeft } from 'lucide-react';

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

// Helper para obtener fecha de hoy en formato YYYY-MM-DD local
const getTodayString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
};

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isKoreaView, setIsKoreaView] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [exportCategory, setExportCategory] = useState('Todas');
  
  const [productos, setProductos] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [notification, setNotification] = useState({ msg: '', type: '' });
  
  const [permisos, setPermisos] = useState({ ocultasParaSocios: ['Tecnología'] });

  const [formProducto, setFormProducto] = useState({ nombre: '', categoriaSelect: '', categoriaNueva: '', marcaSelect: '', marcaNueva: '', descripcion: '', imagen: '' });
  const [formIngreso, setFormIngreso] = useState({ loteSelect: '', loteNuevo: '', sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: '', fechaOperacion: getTodayString() });
  const [formSalida, setFormSalida] = useState({ sku: '', cantidad: '', precioTotal: '', canalVenta: '', metodoPago: '', comprobante: '', documentoCliente: '', fechaOperacion: getTodayString() });
  
  const [editingItem, setEditingItem] = useState(null);
  const [receiptItem, setReceiptItem] = useState(null);
  const [viewProductDetails, setViewProductDetails] = useState(null); 
  
  const [ingresoSearch, setIngresoSearch] = useState('');
  const [showIngresoDropdown, setShowIngresoDropdown] = useState(false);
  const [salidaSearch, setSalidaSearch] = useState('');
  const [showSalidaDropdown, setShowSalidaDropdown] = useState(false);

  const [csvPreview, setCsvPreview] = useState([]);
  const [importLote, setImportLote] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const scannerInputRef = useRef(null);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        const email = user.email?.toLowerCase() || '';
        if (email.includes('socio') || email.includes('korea') || email.includes('invitado')) {
          setUserRole('socio'); setIsKoreaView(true);
        } else if (email.includes('vendedor') || email.includes('tienda')) {
          setUserRole('vendedor'); setActiveTab('salida'); setIsKoreaView(false);
        } else {
          setUserRole('admin'); setActiveTab('dashboard'); setIsKoreaView(false);
        }
      } else {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser || !db) return;
    
    const productosRef = collection(db, 'artifacts', appId, 'public', 'data', 'productos');
    const unsubProductos = onSnapshot(productosRef, (snapshot) => setProductos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

    const ingresosRef = collection(db, 'artifacts', appId, 'public', 'data', 'ingresos');
    const unsubIngresos = onSnapshot(ingresosRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const dateA = new Date(a.fechaOperacion || a.createdAt?.toDate() || 0).getTime();
        const dateB = new Date(b.fechaOperacion || b.createdAt?.toDate() || 0).getTime();
        return dateB - dateA;
      });
      setIngresos(data);
    });

    const salidasRef = collection(db, 'artifacts', appId, 'public', 'data', 'salidas');
    const unsubSalidas = onSnapshot(salidasRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const dateA = new Date(a.fechaOperacion || a.createdAt?.toDate() || 0).getTime();
        const dateB = new Date(b.fechaOperacion || b.createdAt?.toDate() || 0).getTime();
        return dateB - dateA;
      });
      setSalidas(data);
    });

    const configRef = doc(db, 'artifacts', appId, 'configuraciones', 'permisos_roles');
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        setPermisos(docSnap.data());
      }
    });

    return () => { unsubProductos(); unsubIngresos(); unsubSalidas(); unsubConfig(); };
  }, [firebaseUser]);

  const stockCalculado = useMemo(() => {
    const stockMap = {};
    productos.forEach(prod => { stockMap[prod.sku] = { ...prod, totalIngresos: 0, totalSalidas: 0, stockActual: 0, costoPromedio: 0, valorTotal: 0, ventasGeneradas: 0 }; });

    ingresos.forEach(ing => {
      if (!stockMap[ing.sku]) stockMap[ing.sku] = { sku: ing.sku, nombre: 'Descatalogado', totalIngresos: 0, totalSalidas: 0, stockActual: 0, valorTotal: 0, categoria: 'Otros', marca: '-', ventasGeneradas: 0, id: null };
      stockMap[ing.sku].totalIngresos += Number(ing.cantidad);
      stockMap[ing.sku].valorTotal += (Number(ing.costoUnitarioReal) * Number(ing.cantidad));
    });

    salidas.forEach(sal => {
      if (stockMap[sal.sku]) {
        stockMap[sal.sku].totalSalidas += Number(sal.cantidad);
        stockMap[sal.sku].ventasGeneradas += Number(sal.precioTotal || 0);
      }
    });

    Object.values(stockMap).forEach(item => {
      item.stockActual = item.totalIngresos - item.totalSalidas;
      item.costoPromedio = item.totalIngresos > 0 ? (item.valorTotal / item.totalIngresos) : 0;
    });

    let finalStock = Object.values(stockMap);
    if (userRole === 'socio') {
      const ocultas = permisos.ocultasParaSocios || [];
      finalStock = finalStock.filter(item => !ocultas.includes(item.categoria));
    }
    return finalStock;
  }, [ingresos, salidas, userRole, productos, permisos]);

  const alertasStock = useMemo(() => {
    const agotados = stockCalculado.filter(p => p.stockActual <= 0 && p.totalIngresos > 0);
    const criticos = stockCalculado.filter(p => p.stockActual > 0 && p.stockActual <= 5);
    return { agotados, criticos };
  }, [stockCalculado]);

  const finanzas = useMemo(() => {
    let totalVentas = 0; let totalCostoVendido = 0; let valorInventario = 0; let unidadesVendidas = 0;
    salidas.forEach(sal => {
      totalVentas += Number(sal.precioTotal || 0);
      unidadesVendidas += Number(sal.cantidad || 0);
      const prodCosto = stockCalculado.find(s => s.sku === sal.sku)?.costoPromedio || 0;
      totalCostoVendido += (prodCosto * Number(sal.cantidad));
    });
    stockCalculado.forEach(item => { if (item.stockActual > 0) valorInventario += (item.stockActual * item.costoPromedio); });
    return { totalVentas, gananciaBruta: totalVentas - totalCostoVendido, valorInventario, unidadesVendidas };
  }, [salidas, stockCalculado]);

  const directorioClientes = useMemo(() => {
    const clientes = {};
    salidas.forEach(sal => {
      if(!sal.documentoCliente || sal.documentoCliente.trim() === '') return;
      const idCliente = sal.documentoCliente.trim().toUpperCase();
      if (!clientes[idCliente]) clientes[idCliente] = { id: idCliente, compras: 0, gastoTotal: 0, ultimaCompra: sal.createdAt };
      clientes[idCliente].compras += 1;
      clientes[idCliente].gastoTotal += Number(sal.precioTotal || 0);
      if (sal.createdAt && clientes[idCliente].ultimaCompra && sal.createdAt > clientes[idCliente].ultimaCompra) {
        clientes[idCliente].ultimaCompra = sal.createdAt;
      }
    });
    return Object.values(clientes).sort((a, b) => b.gastoTotal - a.gastoTotal);
  }, [salidas]);

  const topProductos = useMemo(() => {
    return [...stockCalculado].sort((a, b) => b.totalSalidas - a.totalSalidas).slice(0, 5);
  }, [stockCalculado]);

  const stockFiltrado = useMemo(() => {
    if (!searchTerm) return stockCalculado;
    return stockCalculado.filter(item => item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || item.sku.toLowerCase().includes(searchTerm.toLowerCase()) || item.marca.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [stockCalculado, searchTerm]);

  const productosFiltradosIngreso = useMemo(() => {
    return productos.filter(p => p.sku.toLowerCase().includes(ingresoSearch.toLowerCase()) || p.nombre.toLowerCase().includes(ingresoSearch.toLowerCase()) || p.marca.toLowerCase().includes(ingresoSearch.toLowerCase()));
  }, [productos, ingresoSearch]);

  const productosFiltradosSalida = useMemo(() => {
    return stockCalculado.filter(p => p.stockActual > 0 && (p.sku.toLowerCase().includes(salidaSearch.toLowerCase()) || p.nombre.toLowerCase().includes(salidaSearch.toLowerCase()) || p.marca.toLowerCase().includes(salidaSearch.toLowerCase())));
  }, [stockCalculado, salidaSearch]);

  const categoriasUnicas = useMemo(() => Array.from(new Set(productos.map(p => p.categoria))), [productos]);
  const marcasUnicas = useMemo(() => Array.from(new Set(productos.map(p => p.marca))), [productos]);
  const lotesUnicos = useMemo(() => Array.from(new Set(ingresos.map(i => i.loteId).filter(Boolean))), [ingresos]);

  const showNotif = (msg, type = 'success') => { setNotification({msg, type}); setTimeout(() => setNotification({msg: '', type: ''}), 4000); };
  const handleLoginSubmit = async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password); } catch (error) { showNotif('❌ Correo o contraseña incorrectos', 'error'); } };
  const handleLogout = async () => { try { await signOut(auth); setLoginForm({ email: '', password: '' }); } catch (error) { console.error(error); } };
  const changeTab = (tab) => { setActiveTab(tab); setIsSidebarOpen(false); };

  const handleTogglePermisoSocio = async (categoria) => {
    if (userRole !== 'admin') return;
    const ocultasActuales = permisos.ocultasParaSocios || [];
    const estaOculta = ocultasActuales.includes(categoria);
    
    let nuevasOcultas;
    if (estaOculta) {
      nuevasOcultas = ocultasActuales.filter(c => c !== categoria);
    } else {
      nuevasOcultas = [...ocultasActuales, categoria];
    }
    
    try {
      await setDoc(doc(db, 'artifacts', appId, 'configuraciones', 'permisos_roles'), { ocultasParaSocios: nuevasOcultas }, { merge: true });
      showNotif(`✅ Visibilidad de "${categoria}" actualizada`);
    } catch (error) {
      showNotif('❌ Error al actualizar permisos', 'error');
    }
  };

  const handleExportCSV = () => {
    let dataToExport = exportCategory !== 'Todas' ? stockCalculado.filter(i => i.categoria === exportCategory) : stockCalculado;
    const headers = ['SKU', 'Producto', 'Categoria', 'Marca', 'Ingresos', 'Salidas', 'Stock_Actual', 'Costo_Promedio_Soles'];
    const csvContent = [headers.join(','), ...dataToExport.map(item => `"${item.sku}","${item.nombre}","${item.categoria}","${item.marca}",${item.totalIngresos},${item.totalSalidas},${item.stockActual},${item.costoPromedio.toFixed(2)}`)].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    link.download = `Inventario_${exportCategory}_${new Date().toLocaleDateString()}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const descargarPlantilla = () => {
    const headers = ['Nombre_Producto', 'Categoria', 'Marca', 'Cantidad', 'Costo_Unitario_Soles', 'Fecha_Operacion'];
    const rowEjemplo = ['Album BTS Proof', 'Álbumes', 'BTS', '10', '15.50', '2024-05-20'];
    const csvContent = [headers.join(','), rowEjemplo.join(',')].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    link.download = `Plantilla_Importacion_CasaSeoul.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split(/\r?\n/);
      const parsedData = [];
      
      let comaCount = 0;
      let puntoComaCount = 0;
      let tabCount = 0;
      
      const linesToCheck = Math.min(rows.length, 6);
      for(let i=1; i < linesToCheck; i++){
          comaCount += (rows[i].match(/,/g) || []).length;
          puntoComaCount += (rows[i].match(/;/g) || []).length;
          tabCount += (rows[i].match(/\t/g) || []).length;
      }

      let delimiter = ',';
      if (puntoComaCount > comaCount && puntoComaCount > tabCount) delimiter = ';';
      else if (tabCount > comaCount && tabCount > puntoComaCount) delimiter = '\t';

      for (let i = 1; i < rows.length; i++) { 
        if (!rows[i].trim()) continue;
        const regex = new RegExp(`(?:^|\\${delimiter})(\\"(?:[^\"]+|\"\")*\\"|[^\\${delimiter}]*)`, 'g');
        const cols = []; let match;
        while ((match = regex.exec(rows[i])) !== null) {
          let val = match[1] || '';
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
          cols.push(val.trim());
        }
        if (cols.length >= 1 && cols[0]) {
          parsedData.push({
            nombre: cols[0] || 'Sin Nombre', 
            categoria: cols[1] || 'Importación', 
            marca: cols[2] || 'Genérica',
            cantidad: parseInt(cols[3]) || 0, 
            costoUnitario: parseFloat(cols[4]) || 0,
            fechaOperacion: cols[5] || getTodayString()
          });
        }
      }
      setCsvPreview(parsedData);
      e.target.value = null; 
    };
    reader.readAsText(file, 'UTF-8');
  };

  const procesarImportacionMasiva = async () => {
    if (!importLote.trim()) return showNotif('❌ Escribe un nombre para el Lote', 'error');
    if (csvPreview.length === 0) return showNotif('❌ No hay datos', 'error');
    setIsImporting(true);

    try {
      let currentProducts = [...productos];
      for (const item of csvPreview) {
        if (item.cantidad <= 0) continue;
        let productoExistente = currentProducts.find(p => p.nombre.toLowerCase() === item.nombre.toLowerCase());
        let finalSku = productoExistente ? productoExistente.sku : null;

        if (!productoExistente) {
          const prefixCat = item.categoria.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(3, 'X');
          const prefixMar = item.marca.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(3, 'X');
          const basePrefix = `${prefixCat}-${prefixMar}`;
          let nextNumber = currentProducts.filter(p => p.sku && p.sku.startsWith(basePrefix)).length + 1;
          finalSku = `${basePrefix}-${String(nextNumber).padStart(3, '0')}`;
          while (currentProducts.some(p => p.sku === finalSku)) { nextNumber++; finalSku = `${basePrefix}-${String(nextNumber).padStart(3, '0')}`; }

          const nuevoProducto = { nombre: item.nombre, categoria: item.categoria, marca: item.marca, sku: finalSku, createdAt: serverTimestamp() };
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'productos'), nuevoProducto);
          currentProducts.push(nuevoProducto); 
        }

        const costoTotalLote = item.costoUnitario * item.cantidad;
        let fechaLimpia = item.fechaOperacion.trim();
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(fechaLimpia)) fechaLimpia = getTodayString();

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'ingresos'), {
          loteId: importLote.toUpperCase(), sku: finalSku, cantidad: item.cantidad,
          costoFob: costoTotalLote, flete: 0, aduanas: 0, igv: 0,
          costoTotalLote: costoTotalLote, costoUnitarioReal: item.costoUnitario, fechaOperacion: fechaLimpia, createdAt: serverTimestamp()
        });
      }
      showNotif('✅ Importación completada');
      setCsvPreview([]); setImportLote(''); setActiveTab('stock');
    } catch (error) { showNotif('❌ Error en importación', 'error'); } finally { setIsImporting(false); }
  };

  const handleGuardarProducto = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db) return;
    if (userRole !== 'admin') return showNotif('❌ No tienes permisos de administrador', 'error');

    const finalCategoria = formProducto.categoriaSelect === '+ Nueva Categoría' ? formProducto.categoriaNueva.trim() : formProducto.categoriaSelect;
    const finalMarca = formProducto.marcaSelect === '+ Nueva Marca' ? formProducto.marcaNueva.trim() : formProducto.marcaSelect;
    if (!finalCategoria || !finalMarca || !formProducto.nombre.trim()) return showNotif('❌ Completa campos obligatorios', 'error');

    const prefixCat = finalCategoria.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(3, 'X');
    const prefixMar = finalMarca.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(3, 'X');
    const basePrefix = `${prefixCat}-${prefixMar}`;
    let nextNumber = productos.filter(p => p.sku && p.sku.startsWith(basePrefix)).length + 1;
    let skuGenerado = `${basePrefix}-${String(nextNumber).padStart(3, '0')}`;
    while (productos.some(p => p.sku === skuGenerado)) { nextNumber++; skuGenerado = `${basePrefix}-${String(nextNumber).padStart(3, '0')}`; }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'productos'), { 
        nombre: formProducto.nombre.trim(), categoria: finalCategoria, marca: finalMarca, sku: skuGenerado, 
        descripcion: formProducto.descripcion.trim(), imagen: formProducto.imagen.trim(), createdAt: serverTimestamp() 
      });
      showNotif(`✅ Producto añadido. SKU: ${skuGenerado}`);
      setFormProducto({ nombre: '', categoriaSelect: '', categoriaNueva: '', marcaSelect: '', marcaNueva: '', descripcion: '', imagen: '' });
    } catch (error) { showNotif('❌ Error al guardar', 'error'); }
  };

  const handleGuardarIngreso = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || userRole !== 'admin') return showNotif('❌ Solo los admins pueden ingresar mercadería', 'error');
    const finalLoteId = formIngreso.loteSelect === '+ Nuevo Lote' ? formIngreso.loteNuevo.trim().toUpperCase() : formIngreso.loteSelect;
    if (!finalLoteId || !formIngreso.sku) return showNotif('❌ Revisa el Lote y el SKU', 'error');

    const cFob = Number(formIngreso.costoFob || 0); const cFlete = Number(formIngreso.flete || 0); const cAduanas = Number(formIngreso.aduanas || 0); const qty = Number(formIngreso.cantidad || 1);
    const costoTotalLote = cFob + cFlete + cAduanas; const costoUnitarioReal = costoTotalLote / qty;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'ingresos'), {
        loteId: finalLoteId, sku: formIngreso.sku, cantidad: formIngreso.cantidad, costoFob: formIngreso.costoFob, flete: formIngreso.flete, aduanas: formIngreso.aduanas, igv: formIngreso.igv, costoTotalLote, costoUnitarioReal, fechaOperacion: formIngreso.fechaOperacion, createdAt: serverTimestamp()
      });
      showNotif('✅ Ingreso registrado');
      setFormIngreso(prev => ({ ...prev, sku: '', cantidad: '', costoFob: '', flete: '', aduanas: '', igv: '', loteSelect: finalLoteId, loteNuevo: '' }));
      setIngresoSearch('');
    } catch (error) { showNotif('❌ Error al guardar', 'error'); }
  };

  const handleGuardarSalida = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db) return;
    if (userRole !== 'admin' && userRole !== 'vendedor') return showNotif('❌ No tienes permisos para vender', 'error');
    
    if (!formSalida.sku) return showNotif('❌ Selecciona un producto a vender', 'error');
    const itemStock = stockCalculado.find(s => s.sku === formSalida.sku);
    if (!itemStock || itemStock.stockActual < Number(formSalida.cantidad)) return showNotif('❌ Stock insuficiente', 'error');

    try {
      const result = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'salidas'), { ...formSalida, vendedorEmail: firebaseUser.email, createdAt: serverTimestamp() });
      showNotif('✅ Venta registrada exitosamente');
      setReceiptItem({ id: result.id, ...formSalida, createdAt: { toDate: () => new Date(formSalida.fechaOperacion) } });
      setFormSalida(prev => ({ ...prev, sku: '', cantidad: '', precioTotal: '', canalVenta: '', metodoPago: '', comprobante: '', documentoCliente: '' }));
      setSalidaSearch('');
    } catch (error) { showNotif('❌ Error al registrar venta', 'error'); }
  };

  const handleDeleteProducto = (id, sku) => {
    if (userRole !== 'admin') return showNotif('❌ Solo administradores pueden borrar.', 'error');
    const tieneHistorial = ingresos.some(i => i.sku === sku) || salidas.some(s => s.sku === sku);
    if (tieneHistorial) { showNotif('❌ BLOQUEADO: Elimina sus ingresos/ventas en el Historial primero.', 'error'); return; }
    if (!id) { showNotif('❌ Este producto ya no existe.', 'error'); return; }
    handleDelete('productos', id);
  };

  const handleDelete = async (coleccion, id) => {
    if (userRole !== 'admin') return showNotif('❌ Solo administradores pueden borrar.', 'error');
    if (!id) return showNotif('❌ Error: Registro inválido.', 'error');
    if (!window.confirm('¿Seguro que deseas eliminar este registro de auditoría?')) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coleccion, id)); showNotif('✅ Eliminado correctamente'); } catch (error) { showNotif('❌ Error al eliminar', 'error'); }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!firebaseUser || !db || !editingItem) return;
    if (userRole !== 'admin') return showNotif('❌ Solo administradores pueden editar.', 'error');
    
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
      showNotif('✅ Actualizado con éxito'); 
      setEditingItem(null);
    } catch (error) { showNotif('❌ Error', 'error'); }
  };

  const handlePrintReceipt = () => { window.print(); };

  const handleBarcodeScan = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      const scannedSKU = salidaSearch.trim().toUpperCase();
      const foundProduct = stockCalculado.find(p => p.sku.toUpperCase() === scannedSKU);
      
      if (foundProduct) {
        if (foundProduct.stockActual > 0) {
          setFormSalida({ ...formSalida, sku: foundProduct.sku, cantidad: '1' }); 
          setSalidaSearch(`${foundProduct.sku} - ${foundProduct.nombre}`);
          setShowSalidaDropdown(false);
          showNotif(`✅ Producto detectado: ${foundProduct.nombre}`);
        } else {
          showNotif('❌ El producto escaneado no tiene stock.', 'error');
        }
      } else {
        setShowSalidaDropdown(true);
      }
    }
  };

  if (!userRole) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200 transform rotate-3"><Lock className="w-10 h-10 text-white transform -rotate-3" /></div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900">CASA SEOUL</h1>
            <p className="text-slate-500 text-sm mt-2 uppercase tracking-widest font-medium">Cloud ERP System</p>
          </div>
          {notification.msg && <div className={`mb-6 p-4 rounded-xl text-sm font-medium text-center animate-pulse ${notification.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>{notification.msg}</div>}
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Correo Autorizado</label>
              <input type="email" required placeholder="tu-correo@casaseoul.com" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-indigo-600 focus:bg-white transition-all text-slate-800 font-medium" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Contraseña</label>
              <input type="password" required placeholder="••••••••" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-indigo-600 focus:bg-white transition-all text-slate-800 font-medium" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]">Ingresar al Sistema</button>
          </form>
        </div>
      </div>
    );
  }

  const renderVistaCorea = () => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b pb-6">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Korea Dashboard</h2><p className="text-slate-500 mt-1">Live Inventory Status - Seoul HQ</p></div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-400 uppercase">Visible SKUs</p>
            <p className="text-xl font-black text-indigo-600">{stockFiltrado.length}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl"><Globe2 className="w-8 h-8 text-blue-500" /></div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full text-left border-collapse">
          <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-bold"><th className="p-5 border-b">SKU / Item ID</th><th className="p-5 border-b">Product Name</th><th className="p-5 border-b">Category</th><th className="p-5 border-b text-right">Current Stock</th><th className="p-5 border-b text-center">Status / Details</th></tr></thead>
          <tbody className="text-slate-700 divide-y divide-slate-100 bg-white">
            {stockFiltrado.map(item => (
              <tr key={item.sku} className="hover:bg-slate-50 transition-colors group">
                <td className="p-5 font-mono text-sm font-medium text-slate-500 group-hover:text-indigo-600 transition-colors">{item.sku}</td>
                <td className="p-5 font-bold">{item.nombre} <span className="block font-normal text-xs text-slate-400 mt-1">{item.marca}</span></td>
                <td className="p-5"><span className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-medium">{item.categoria}</span></td>
                <td className="p-5 font-black text-xl text-right">{item.stockActual}</td>
                <td className="p-5 text-center flex items-center justify-center gap-3">
                  {item.stockActual <= 5 ? <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100">REORDER</span> : <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold border border-emerald-100">IN STOCK</span>}
                  <button onClick={() => setViewProductDetails(item)} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors" title="View Details"><Eye className="w-4 h-4"/></button>
                </td>
              </tr>
            ))}
            {stockFiltrado.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400 font-medium">No records found. Contact Administrator.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 overflow-hidden">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

      {userRole !== 'socio' && !isKoreaView && (
        <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none print:hidden`}>
          <div className="p-6 md:p-8 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">CASA SEOUL</h1>
              <p className="text-xs text-indigo-400 mt-1 uppercase tracking-widest font-bold">
                {userRole === 'admin' ? 'ERP Admin' : 'Terminal POS'}
              </p>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
          </div>
          
          <nav className="flex-1 px-4 space-y-1.5 mt-2 overflow-y-auto pb-6">
            
            {userRole === 'admin' && (
              <>
                <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 mt-2">Analítica y CRM</p>
                <button onClick={() => changeTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><PieChart className="w-5 h-5" /> Resumen Financiero</button>
                <button onClick={() => changeTab('clientes')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'clientes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Users className="w-5 h-5" /> Directorio de Clientes</button>
                
                <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 mt-6">Operativa Logística</p>
                <button onClick={() => changeTab('stock')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'stock' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Package className="w-5 h-5" /> Inventario Maestro</button>
                <button onClick={() => changeTab('catalogo')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'catalogo' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Tags className="w-5 h-5" /> Catálogo de Prod.</button>
                <button onClick={() => changeTab('importar')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'importar' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><UploadCloud className="w-5 h-5 text-indigo-300" /> Subida Masiva Excel</button>
                
                <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 mt-6">Caja y Transacciones</p>
                <button onClick={() => changeTab('ingreso')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'ingreso' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><TrendingDown className="w-5 h-5" /> Registrar Ingreso</button>
                <button onClick={() => changeTab('salida')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'salida' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><TrendingUp className="w-5 h-5" /> Registrar Venta <span className="ml-auto bg-indigo-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">POS</span></button>
                <button onClick={() => changeTab('reporte')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'reporte' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><BarChart3 className="w-5 h-5" /> Historial de Caja</button>

                <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 mt-6">Administración</p>
                <button onClick={() => changeTab('seguridad')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'seguridad' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Settings className="w-5 h-5" /> Seguridad y Accesos</button>
              </>
            )}

            {userRole === 'vendedor' && (
              <>
                <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 mt-2">Caja y Ventas</p>
                <button onClick={() => changeTab('salida')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'salida' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><TrendingUp className="w-5 h-5" /> Registrar Venta <span className="ml-auto bg-indigo-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">POS</span></button>
                
                <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 mt-6">Consultas</p>
                <button onClick={() => changeTab('stock')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'stock' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Package className="w-5 h-5" /> Ver Stock General</button>
              </>
            )}
          </nav>
          
          <div className="p-6 border-t border-slate-800">
             <div className="flex items-center gap-3 mb-4 px-2">
               <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs uppercase">{firebaseUser?.email?.charAt(0)}</div>
               <div className="overflow-hidden">
                 <p className="text-xs font-bold text-slate-300 truncate">{firebaseUser?.email}</p>
                 <p className="text-[10px] text-slate-500 uppercase tracking-wider">{userRole}</p>
               </div>
             </div>
             <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 text-sm font-medium text-slate-300 hover:bg-red-500 hover:text-white transition-colors"><LogOut className="w-4 h-4" /> Cerrar Sesión</button>
          </div>
        </aside>
      )}

      {/* --- CABECERA SUPERIOR --- */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10 sticky top-0 shadow-sm print:hidden">
          <div className="flex items-center gap-4">
            {userRole !== 'socio' && !isKoreaView && <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"><Menu className="w-6 h-6" /></button>}
            <h2 className="font-bold text-slate-800 hidden sm:block">
              {userRole === 'socio' || isKoreaView ? 'Seoul Headquarters' : userRole === 'admin' ? 'Terminal ERP de Administración' : 'Punto de Venta Oficial'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {userRole === 'socio' && <button onClick={handleLogout} className="text-sm font-bold text-red-600 flex items-center gap-2 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors border border-red-100"><LogOut className="w-4 h-4" /> Cerrar Sesión</button>}
            {userRole === 'admin' && (
              <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide hidden sm:block">{isKoreaView ? 'Volver a Admin' : 'Simular Vista Corea'}</span>
                <button onClick={() => { setIsKoreaView(!isKoreaView); setIsSidebarOpen(false); }} className={`w-12 h-6 rounded-full flex items-center transition-colors p-1 ${isKoreaView ? 'bg-indigo-600' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isKoreaView ? 'translate-x-6' : ''}`}></div></button>
              </div>
            )}
          </div>
        </header>

        {/* ÁREA DE TRABAJO SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative print:p-0 print:overflow-visible">
          
          {/* NOTIFICACIÓN FLOTANTE */}
          {notification.msg && <div className={`fixed bottom-6 right-6 md:left-1/2 md:transform md:-translate-x-1/2 px-6 py-4 rounded-2xl shadow-2xl font-bold z-50 flex items-center gap-3 animate-in slide-in-from-bottom-5 print:hidden ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
             {notification.type === 'error' ? <AlertCircle className="w-5 h-5"/> : <ShieldCheck className="w-5 h-5"/>} {notification.msg}
          </div>}

          {(isKoreaView || userRole === 'socio') ? (
            <div className="max-w-6xl mx-auto">{renderVistaCorea()}</div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-6 pb-20 print:pb-0 print:space-y-0">
              
              {/* --- DASHBOARD Y ALERTAS (SOLO ADMIN) --- */}
              {activeTab === 'dashboard' && userRole === 'admin' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <PieChart className="text-indigo-600 w-8 h-8" />
                      <h2 className="text-2xl font-black text-slate-900">Resumen Financiero</h2>
                    </div>
                  </div>

                  {(alertasStock.agotados.length > 0 || alertasStock.criticos.length > 0) && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-amber-500" />
                        <h3 className="font-bold text-slate-800">Centro de Alertas Operativas</h3>
                      </div>
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {alertasStock.agotados.length > 0 && (
                          <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                            <div className="flex items-center gap-2 text-red-700 font-bold mb-3"><AlertCircle className="w-5 h-5" /> Stock Agotado ({alertasStock.agotados.length})</div>
                            <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                              {alertasStock.agotados.map(p => (
                                <div key={p.sku} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-red-100">
                                  <span className="font-medium text-slate-700 truncate pr-2">{p.nombre}</span><span className="font-mono text-red-600 font-bold">{p.sku}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {alertasStock.criticos.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                            <div className="flex items-center gap-2 text-amber-700 font-bold mb-3"><AlertTriangle className="w-5 h-5" /> Nivel Crítico (≤ 5) ({alertasStock.criticos.length})</div>
                            <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                              {alertasStock.criticos.map(p => (
                                <div key={p.sku} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-amber-100">
                                  <span className="font-medium text-slate-700 truncate pr-2">{p.nombre}</span><span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-black text-xs">Quedan {p.stockActual}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ventas Brutas</p>
                      <h3 className="text-3xl font-black text-slate-800">S/ {finanzas.totalVentas.toFixed(2)}</h3>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ganancia Neta Est.</p>
                      <h3 className="text-3xl font-black text-slate-800">S/ {finanzas.gananciaBruta.toFixed(2)}</h3>
                      <p className="text-xs font-medium text-slate-400 mt-1">Ingresos - Costo Promedio</p>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-purple-500">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Valor Inventario</p>
                      <h3 className="text-3xl font-black text-slate-800">S/ {finanzas.valorInventario.toFixed(2)}</h3>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-orange-500">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unidades Vendidas</p>
                      <h3 className="text-3xl font-black text-slate-800">{finanzas.unidadesVendidas} <span className="text-sm font-medium text-slate-400">uds</span></h3>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Award className="w-5 h-5 text-amber-500"/> Top 5 Productos Estrella</h3>
                    <div className="space-y-4">
                      {topProductos.map((prod, index) => (
                        <div key={prod.sku} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${index === 0 ? 'bg-amber-100 text-amber-600 text-lg shadow-inner' : index === 1 ? 'bg-slate-200 text-slate-600' : index === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</div>
                            <div><p className="font-bold text-slate-800 text-lg">{prod.nombre}</p><p className="text-xs text-slate-500 font-mono tracking-wide">{prod.sku} • {prod.marca}</p></div>
                          </div>
                          <div className="text-right"><p className="font-black text-emerald-600 text-lg">S/ {prod.ventasGeneradas.toFixed(2)}</p><p className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-1 rounded-full mt-1 inline-block">{prod.totalSalidas} uds vendidas</p></div>
                        </div>
                      ))}
                      {topProductos.length === 0 && <p className="text-slate-400 text-center py-4">No hay datos suficientes para mostrar.</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* --- CRM CLIENTES (SOLO ADMIN) --- */}
              {activeTab === 'clientes' && userRole === 'admin' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6"><h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><Users className="text-indigo-600 w-8 h-8" /> Directorio de Clientes (CRM)</h2><p className="text-slate-500 text-sm mt-2">Agrupación automática de clientes basada en su DNI/Nombre.</p></div>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100"><tr><th className="p-5">Identificador</th><th className="p-5 text-center">Nº Compras</th><th className="p-5 text-right">Gasto Acumulado</th><th className="p-5">Última Compra</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {directorioClientes.map((cliente, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="p-5 font-bold text-slate-700">{cliente.id}</td>
                            <td className="p-5 text-center"><span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold">{cliente.compras}</span></td>
                            <td className="p-5 text-right font-black text-emerald-600">S/ {cliente.gastoTotal.toFixed(2)}</td>
                            <td className="p-5 text-slate-400 text-xs font-medium">{cliente.ultimaCompra?.toDate().toLocaleDateString() || '-'}</td>
                          </tr>
                        ))}
                        {directorioClientes.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-slate-400 font-medium">No hay clientes registrados.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- INVENTARIO MAESTRO (ADMIN Y VENDEDOR) --- */}
              {activeTab === 'stock' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 border-b pb-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><Package className="text-indigo-600 w-8 h-8" /> Inventario Maestro</h2>
                      {userRole === 'vendedor' && <p className="text-slate-500 text-sm mt-1">Busca stock disponible para ofrecer a los clientes.</p>}
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch gap-4 w-full lg:w-auto">
                      <div className="relative flex-1 sm:min-w-[250px]"><Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Buscar producto o SKU..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shrink-0"><select className="text-sm border-none bg-transparent outline-none font-bold text-slate-600 cursor-pointer pl-2" value={exportCategory} onChange={(e) => setExportCategory(e.target.value)}><option value="Todas">Todo el Inventario</option>{categoriasUnicas.map(cat => <option key={cat} value={cat}>Solo {cat}</option>)}</select><button onClick={handleExportCSV} className="ml-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-md transition-colors flex items-center justify-center" title="Descargar CSV"><Download className="w-5 h-5" /></button></div>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100">
                        <tr>
                          <th className="p-4">SKU</th>
                          <th className="p-4">Producto</th>
                          <th className="p-4 text-center">Ingresos</th>
                          <th className="p-4 text-center">Salidas</th>
                          <th className="p-4 text-right text-indigo-600">Stock Real</th>
                          {userRole === 'admin' && <th className="p-4 text-right">Costo Promedio</th>}
                          <th className="p-4 text-center">{userRole === 'admin' ? 'Acciones' : 'Ver'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {stockFiltrado.map(item => (
                          <tr key={item.sku} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono font-bold text-slate-500">{item.sku}</td>
                            <td className="p-4"><span className="font-bold text-slate-800 block">{item.nombre}</span><div className="flex gap-2 mt-1"><span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-100 rounded text-slate-500">{item.marca}</span><span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-50 rounded text-indigo-500">{item.categoria}</span></div></td>
                            <td className="p-4 text-center text-blue-600 font-bold bg-blue-50/30">{item.totalIngresos}</td><td className="p-4 text-center text-orange-500 font-bold bg-orange-50/30">{item.totalSalidas}</td>
                            <td className="p-4 text-right font-black text-xl"><span className={item.stockActual <= 5 ? 'text-red-500 bg-red-50 px-3 py-1 rounded-lg border border-red-100 shadow-sm' : 'text-emerald-600'}>{item.stockActual}</span></td>
                            
                            {userRole === 'admin' && <td className="p-4 text-right text-slate-600 font-bold">S/ {item.costoPromedio.toFixed(2)}</td>}
                            
                            <td className="p-4 text-center flex items-center justify-center gap-1">
                              <button onClick={() => setViewProductDetails(item)} className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors" title="Ver Detalles"><Eye className="w-5 h-5"/></button>
                              {userRole === 'admin' && (
                                <>
                                  <button onClick={() => setEditingItem({ type: 'productos', id: item.id, data: item })} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Editar Producto"><Edit2 className="w-5 h-5"/></button>
                                  <button onClick={() => handleDeleteProducto(item.id, item.sku)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Eliminar Producto"><Trash2 className="w-5 h-5"/></button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                        {stockFiltrado.length === 0 && <tr><td colSpan={userRole === 'admin' ? 7 : 6} className="p-12 text-center text-slate-400 font-medium">No se encontraron productos.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- CATÁLOGO (SOLO ADMIN) --- */}
              {activeTab === 'catalogo' && userRole === 'admin' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6"><h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><Tags className="text-indigo-600 w-8 h-8" /> Catálogo Maestro</h2></div>
                  <div className="mb-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start text-sm text-blue-800"><Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" /><div><strong className="block mb-1">💡 Auto-SKU Inteligente y Multimedia</strong>Agrega una descripción y pega un enlace (URL) de una foto de Google para que los socios en Corea reconozcan el producto visualmente.</div></div>
                  <form onSubmit={handleGuardarProducto} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nombre</label><input required value={formProducto.nombre} onChange={e => setFormProducto({...formProducto, nombre: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Categoría</label>
                      <select required value={formProducto.categoriaSelect} onChange={e => setFormProducto({...formProducto, categoriaSelect: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none mb-2"><option value="">Selecciona...</option>{categoriasUnicas.map(cat => <option key={cat} value={cat}>{cat}</option>)}<option value="+ Nueva Categoría" className="font-bold text-indigo-600">+ Añadir nueva...</option></select>
                      {formProducto.categoriaSelect === '+ Nueva Categoría' && <input required autoFocus value={formProducto.categoriaNueva} onChange={e => setFormProducto({...formProducto, categoriaNueva: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" />}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Marca</label>
                      <select required value={formProducto.marcaSelect} onChange={e => setFormProducto({...formProducto, marcaSelect: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none mb-2"><option value="">Selecciona...</option>{marcasUnicas.map(m => <option key={m} value={m}>{m}</option>)}<option value="+ Nueva Marca" className="font-bold text-indigo-600">+ Añadir nueva...</option></select>
                      {formProducto.marcaSelect === '+ Nueva Marca' && <input required autoFocus value={formProducto.marcaNueva} onChange={e => setFormProducto({...formProducto, marcaNueva: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none" />}
                    </div>
                    
                    <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">URL de la Imagen <span className="font-normal lowercase text-slate-400">(Opcional)</span></label><input value={formProducto.imagen} onChange={e => setFormProducto({...formProducto, imagen: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Pega el enlace web de la foto..." /></div>
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Descripción <span className="font-normal lowercase text-slate-400">(Opcional)</span></label><textarea value={formProducto.descripcion} onChange={e => setFormProducto({...formProducto, descripcion: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" rows="1" placeholder="Detalles de la versión, color, etc..."></textarea></div>
                    </div>

                    <div className="md:col-span-3 flex justify-end mt-2"><button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold">Guardar y Generar SKU</button></div>
                  </form>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-sm text-left whitespace-nowrap"><thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100"><tr><th className="p-4">SKU</th><th className="p-4">Producto</th><th className="p-4 text-center">Detalles</th><th className="p-4 text-right">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{productos.map(p => (<tr key={p.id} className="hover:bg-slate-50"><td className="p-4 font-mono font-bold text-indigo-600">{p.sku}</td><td className="p-4 font-bold text-slate-700">{p.nombre}</td><td className="p-4 text-center"><button onClick={() => setViewProductDetails(p)} className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"><Eye className="w-5 h-5"/></button></td><td className="p-4 text-right"><button onClick={() => handleDeleteProducto(p.id, p.sku)} className="text-red-500 hover:bg-red-100 p-2 rounded-lg"><Trash2 className="w-5 h-5"/></button></td></tr>))}</tbody></table>
                  </div>
                </div>
              )}

              {/* --- IMPORTAR (SOLO ADMIN) --- */}
              {activeTab === 'importar' && userRole === 'admin' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                      <UploadCloud className="text-indigo-600 w-8 h-8" /> Importación Masiva (Excel/CSV)
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">Sube de golpe 50 o 100 productos de tu importación rellenando la plantilla estándar.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">Paso 1: Descargar Plantilla</h3>
                      <p className="text-sm text-slate-500 mb-4">La plantilla incluye ahora la columna <strong>Fecha_Operacion</strong> para que subas datos de meses pasados.</p>
                      <button onClick={descargarPlantilla} className="w-full bg-white border border-slate-300 text-slate-700 hover:border-indigo-500 hover:text-indigo-600 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                        <FileText className="w-5 h-5" /> Descargar Plantilla .CSV
                      </button>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">Paso 2: Subir Archivo</h3>
                      <p className="text-sm text-slate-500 mb-4">Sube aquí tu archivo modificado en formato <strong>.CSV</strong>.</p>
                      <div className="relative">
                        <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="w-full bg-white border border-dashed border-indigo-300 text-indigo-600 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                          <UploadCloud className="w-5 h-5" /> Seleccionar archivo CSV
                        </div>
                      </div>
                    </div>
                  </div>

                  {csvPreview.length > 0 && (
                    <div className="border border-indigo-100 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="bg-indigo-50 p-6 border-b border-indigo-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h3 className="font-black text-indigo-900 text-lg">Previsualización de Datos</h3>
                          <p className="text-sm text-indigo-600 mt-1">{csvPreview.length} productos listos para ser guardados.</p>
                        </div>
                        <div className="w-full md:w-1/3">
                          <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2">ID de Lote (Obligatorio)</label>
                          <input type="text" required value={importLote} onChange={e => setImportLote(e.target.value)} className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-900 uppercase placeholder-indigo-300" placeholder="Ej: IMPORT-06" />
                        </div>
                      </div>
                      
                      <div className="max-h-64 overflow-y-auto">
                        <table className="min-w-full text-sm text-left whitespace-nowrap">
                          <thead className="bg-white text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100 sticky top-0">
                            <tr><th className="p-4">Fecha Op.</th><th className="p-4">Producto</th><th className="p-4">Categoría</th><th className="p-4">Marca</th><th className="p-4 text-center">Cant.</th><th className="p-4 text-right">Costo Unitario</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-slate-50/30">
                            {csvPreview.map((item, idx) => (
                              <tr key={idx}>
                                <td className="p-4 font-mono text-slate-500">{item.fechaOperacion}</td><td className="p-4 font-bold text-slate-700">{item.nombre}</td><td className="p-4 text-slate-500">{item.categoria}</td><td className="p-4 text-slate-500">{item.marca}</td><td className="p-4 text-center font-black text-blue-600">{item.cantidad}</td><td className="p-4 text-right font-medium text-slate-600">S/ {item.costoUnitario.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="bg-white p-6 border-t border-indigo-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                          <AlertCircle className="w-4 h-4"/> <span>Se generarán SKUs y se insertarán con la fecha de operación indicada.</span>
                        </div>
                        <div className="flex gap-3 w-full sm:w-auto">
                          <button onClick={() => setCsvPreview([])} className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
                          <button onClick={procesarImportacionMasiva} disabled={isImporting} className={`w-full sm:w-auto px-8 py-3 rounded-xl font-black text-white transition-all shadow-md ${isImporting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}>
                            {isImporting ? 'Procesando...' : 'Confirmar y Guardar Todo'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- INGRESO (SOLO ADMIN) --- */}
              {activeTab === 'ingreso' && userRole === 'admin' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6"><h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><TrendingDown className="text-blue-600 w-8 h-8" /> Ingresar Stock (Manual)</h2></div>
                  <form onSubmit={handleGuardarIngreso} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lote / Importación</label>
                          <select required value={formIngreso.loteSelect} onChange={e => setFormIngreso({...formIngreso, loteSelect: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"><option value="">Selecciona...</option>{lotesUnicos.map(l => <option key={l} value={l}>{l}</option>)}<option value="+ Nuevo Lote" className="font-bold text-blue-600">+ Crear nuevo lote...</option></select>
                          {formIngreso.loteSelect === '+ Nuevo Lote' && <input required autoFocus value={formIngreso.loteNuevo} onChange={e => setFormIngreso({...formIngreso, loteNuevo: e.target.value})} className="w-full mt-3 px-4 py-3 border-2 border-blue-200 rounded-xl uppercase" placeholder="Ej: IMP-COREA-05" />}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Fecha</label>
                          <input type="date" required value={formIngreso.fechaOperacion} onChange={e => setFormIngreso({...formIngreso, fechaOperacion: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-600" />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 relative">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Producto</label>
                          <div className="relative">
                            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                            <input type="text" required={!formIngreso.sku} placeholder="Escribe para buscar..." value={ingresoSearch} onChange={(e) => { setIngresoSearch(e.target.value); setFormIngreso({ ...formIngreso, sku: '' }); setShowIngresoDropdown(true); }} onFocus={() => setShowIngresoDropdown(true)} onBlur={() => setTimeout(() => setShowIngresoDropdown(false), 200)} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
                          </div>
                          {showIngresoDropdown && (
                            <div className="absolute z-20 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                              {productosFiltradosIngreso.length > 0 ? productosFiltradosIngreso.map(p => (<div key={p.id} onMouseDown={() => { setFormIngreso({ ...formIngreso, sku: p.sku }); setIngresoSearch(`${p.sku} - ${p.nombre}`); setShowIngresoDropdown(false); }} className={`px-4 py-3 cursor-pointer hover:bg-blue-50 border-b border-slate-50 ${formIngreso.sku === p.sku ? 'bg-blue-50' : ''}`}><div className="font-bold text-slate-800">{p.nombre}</div><div className="text-xs text-slate-500 font-mono mt-0.5">{p.sku}</div></div>)) : <div className="p-4 text-center text-slate-500">No encontrado</div>}
                            </div>
                          )}
                        </div>
                        <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cant.</label><input required type="number" min="1" value={formIngreso.cantidad} onChange={e => setFormIngreso({...formIngreso, cantidad: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none font-black text-center text-lg text-blue-600" /></div>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-5">
                      <h3 className="font-black flex items-center gap-2 text-slate-700 uppercase text-sm border-b pb-3"><Calculator className="w-5 h-5 text-slate-400"/> Costos (S/) <span className="font-normal text-xs text-slate-400 ml-auto">Opcional</span></h3>
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">FOB Total del Lote</label><input type="number" step="0.01" value={formIngreso.costoFob} onChange={e => setFormIngreso({...formIngreso, costoFob: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl" /></div>
                    </div>
                    <div className="md:col-span-2 flex justify-end mt-2"><button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-xl font-black text-lg">Sumar Stock</button></div>
                  </form>
                </div>
              )}

              {/* --- SALIDA / POS (ADMIN Y VENDEDOR) --- */}
              {activeTab === 'salida' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><TrendingUp className="text-emerald-500 w-8 h-8" /> Terminal de Venta (POS)</h2>
                      <p className="text-slate-500 text-sm mt-2">Deduce productos rápidamente al realizar una venta física o digital.</p>
                    </div>
                    <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border border-emerald-200 shadow-inner">
                      <ScanLine className="w-5 h-5"/> Soporte para Lector USB Activo
                    </div>
                  </div>
                  <form onSubmit={handleGuardarSalida} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="relative">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Producto o SKU (Escanea Aquí)</label>
                        <div className="relative">
                          <ScanLine className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                          <input 
                            type="text" 
                            required={!formSalida.sku} 
                            placeholder="Buscar nombre o escanear código de barras..." 
                            value={salidaSearch} 
                            ref={scannerInputRef}
                            onChange={(e) => { 
                              setSalidaSearch(e.target.value); 
                              setFormSalida({ ...formSalida, sku: '' }); 
                              setShowSalidaDropdown(true); 
                            }} 
                            onKeyDown={handleBarcodeScan}
                            onFocus={() => setShowSalidaDropdown(true)} 
                            onBlur={() => setTimeout(() => setShowSalidaDropdown(false), 200)} 
                            className="w-full pl-10 pr-4 py-4 bg-white border-2 border-emerald-100 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 font-medium text-lg transition-all shadow-sm" 
                          />
                        </div>
                        {showSalidaDropdown && (
                          <div className="absolute z-20 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                            {productosFiltradosSalida.length > 0 ? productosFiltradosSalida.map(p => (<div key={p.sku} onMouseDown={() => { setFormSalida({ ...formSalida, sku: p.sku }); setSalidaSearch(`${p.sku} - ${p.nombre}`); setShowSalidaDropdown(false); }} className={`px-4 py-3 cursor-pointer hover:bg-emerald-50 border-b border-slate-50 ${formSalida.sku === p.sku ? 'bg-emerald-50' : ''}`}><div className="flex justify-between items-center"><div className="font-bold text-slate-800 truncate pr-2">{p.nombre}</div><div className="text-xs font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded">Stock: {p.stockActual}</div></div><div className="text-xs text-slate-500 font-mono mt-0.5">{p.sku}</div></div>)) : <div className="p-4 text-center text-slate-500 font-medium">No hay stock disponible</div>}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-slate-500 mb-2">Unidades a Cobrar</label><input required type="number" min="1" value={formSalida.cantidad} onChange={e => setFormSalida({...formSalida, cantidad: e.target.value})} className="w-full px-4 py-4 border-2 border-slate-200 focus:border-emerald-500 rounded-xl font-black text-center text-2xl text-emerald-600 outline-none transition-colors" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-2">Monto Cobrado (S/)</label><input type="number" step="0.01" value={formSalida.precioTotal} onChange={e => setFormSalida({...formSalida, precioTotal: e.target.value})} className="w-full px-4 py-4 border-2 border-slate-200 focus:border-emerald-500 rounded-xl font-bold text-lg outline-none transition-colors" placeholder="0.00" /></div>
                      </div>
                    </div>
                    
                    {/* MEJORA UX Y TIP PARA VENDEDOR */}
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-5">
                      <h3 className="font-black flex items-center gap-2 text-slate-700 uppercase text-sm border-b pb-3"><ShieldCheck className="w-5 h-5 text-slate-400"/> Datos para el Recibo</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-slate-500 mb-2">Método de Pago</label><select value={formSalida.metodoPago} onChange={e => setFormSalida({...formSalida, metodoPago: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"><option value="">Seleccionar...</option><option>Yape/Plin</option><option>Tarjeta POS</option><option>Efectivo</option></select></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-2">DNI / Nombre Cliente</label><input type="text" value={formSalida.documentoCliente} onChange={e => setFormSalida({...formSalida, documentoCliente: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="Ej: 7283... (Para Descuentos)" /></div>
                      </div>
                      
                      <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2 items-start text-xs text-blue-700">
                        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                        <p><strong>Estrategia de Ventas:</strong> Pide el DNI diciendo: <em>"¿Me indica su DNI para afiliarlo a nuestros descuentos de cliente frecuente?"</em>. Esto alimenta nuestro CRM automático.</p>
                      </div>
                    </div>

                    <div className="md:col-span-2 flex justify-end mt-4 pt-6 border-t border-slate-200">
                      <button type="submit" className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-600 text-white px-12 py-4 rounded-xl font-black text-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 active:scale-95 transition-all">
                         <ShieldCheck className="w-6 h-6"/> Procesar Venta
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* --- HISTORIAL / AUDITORIA (SOLO ADMIN) --- */}
              {activeTab === 'reporte' && userRole === 'admin' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6"><h2 className="text-2xl font-black text-slate-900 flex items-center gap-3"><BarChart3 className="text-purple-600 w-8 h-8" /> Historial de Auditoría</h2></div>
                  
                  <div className="space-y-12">
                    <div>
                      <h3 className="font-black text-sm text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-500"/> Registro de Salidas (Ventas)</h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="min-w-full text-sm text-left whitespace-nowrap">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100"><tr><th className="p-4">Fecha Operación</th><th className="p-4">Vendedor</th><th className="p-4">Cliente</th><th className="p-4">SKU</th><th className="p-4 text-center">Cant</th><th className="p-4">Total (S/)</th><th className="p-4 text-right">Acciones</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {salidas.map(s => (
                              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-slate-600 font-bold">{s.fechaOperacion || s.createdAt?.toDate().toLocaleDateString() || '-'}</td>
                                <td className="p-4 text-xs font-medium text-slate-500">{s.vendedorEmail || 'Admin'}</td>
                                <td className="p-4 font-medium text-slate-600">{s.documentoCliente || 'Mostrador'}</td>
                                <td className="p-4 font-bold text-slate-700">{s.sku}</td>
                                <td className="p-4 text-center font-bold text-emerald-600 bg-emerald-50/50">{s.cantidad}</td>
                                <td className="p-4 text-emerald-600 font-black">{s.precioTotal ? `S/ ${s.precioTotal}` : '-'}</td>
                                <td className="p-4 flex justify-end gap-1">
                                  <button onClick={() => setReceiptItem(s)} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg" title="Imprimir Ticket"><Printer className="w-4 h-4"/></button>
                                  <button onClick={() => setEditingItem({ type: 'salidas', id: s.id, data: s })} className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg" title="Editar"><Edit2 className="w-4 h-4"/></button>
                                  <button onClick={() => handleDelete('salidas', s.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                                </td>
                              </tr>
                            ))}
                            {salidas.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-400 font-medium">No hay ventas registradas</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-black text-sm text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-blue-500"/> Registro de Ingresos (Lotes)</h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="min-w-full text-sm text-left whitespace-nowrap">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-100"><tr><th className="p-4">Fecha Operación</th><th className="p-4">Lote ID</th><th className="p-4">SKU</th><th className="p-4 text-center">Cant</th><th className="p-4">FOB Total</th><th className="p-4 text-right">Acciones</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {ingresos.map(i => (
                              <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-slate-600 font-bold">{i.fechaOperacion || i.createdAt?.toDate().toLocaleDateString() || '-'}</td>
                                <td className="p-4 font-mono font-bold text-slate-500">{i.loteId || 'S/N'}</td>
                                <td className="p-4 font-bold text-slate-700">{i.sku}</td>
                                <td className="p-4 text-center font-bold text-blue-600 bg-blue-50/50">{i.cantidad}</td>
                                <td className="p-4 text-slate-500 font-medium">S/ {i.costoTotalLote?.toFixed(2) || '0.00'}</td>
                                <td className="p-4 flex justify-end gap-1">
                                  <button onClick={() => setEditingItem({ type: 'ingresos', id: i.id, data: i })} className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg" title="Editar"><Edit2 className="w-4 h-4"/></button>
                                  <button onClick={() => handleDelete('ingresos', i.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                                </td>
                              </tr>
                            ))}
                            {ingresos.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-400 font-medium">No hay ingresos registrados</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* === NUEVO PANEL DE SEGURIDAD PARA ADMIN === */}
              {activeTab === 'seguridad' && userRole === 'admin' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <div className="mb-8 border-b pb-6">
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                      <Settings className="text-indigo-600 w-8 h-8" /> Panel de Seguridad y Accesos
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">Administra qué categorías de productos pueden ver los socios internacionales (Korea Dashboard). Los cambios se aplican en tiempo real.</p>
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><Globe2 className="w-5 h-5 text-blue-500"/> Visibilidad para Socios (Corea)</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {categoriasUnicas.map(cat => {
                        const estaOculta = (permisos.ocultasParaSocios || []).includes(cat);
                        return (
                          <div key={cat} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${estaOculta ? 'bg-white border-slate-200' : 'bg-indigo-50 border-indigo-200'}`}>
                            <span className={`font-bold ${estaOculta ? 'text-slate-500' : 'text-indigo-900'}`}>{cat}</span>
                            <button 
                              onClick={() => handleTogglePermisoSocio(cat)}
                              className="focus:outline-none"
                            >
                              {estaOculta ? (
                                <ToggleLeft className="w-8 h-8 text-slate-400" />
                              ) : (
                                <ToggleRight className="w-8 h-8 text-indigo-600" />
                              )}
                            </button>
                          </div>
                        )
                      })}
                      {categoriasUnicas.length === 0 && <p className="text-slate-400 text-sm">Crea productos en tu catálogo para gestionar sus permisos.</p>}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* === MODALES GLOBALES === */}

          {receiptItem && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 print:bg-white print:static print:inset-auto print:block">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-8 relative print:shadow-none print:w-full">
                <button onClick={() => setReceiptItem(null)} className="absolute top-4 right-4 text-slate-400 print:hidden"><X className="w-6 h-6" /></button>
                <div className="text-center mb-6 border-b pb-4 border-dashed border-slate-300">
                  <h1 className="text-2xl font-black text-slate-900">CASA SEOUL</h1>
                  <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Recibo de Venta</p>
                </div>
                <div className="space-y-2 text-sm text-slate-700 font-mono mb-6 border-b pb-4 border-dashed border-slate-300">
                  <p className="flex justify-between"><span>Fecha Op:</span> <span>{receiptItem.fechaOperacion || receiptItem.createdAt?.toDate().toLocaleDateString() || 'Hoy'}</span></p>
                  <p className="flex justify-between"><span>Cajero:</span> <span className="truncate ml-4">{receiptItem.vendedorEmail || firebaseUser?.email || 'Caja'}</span></p>
                  <p className="flex justify-between"><span>Cliente:</span> <span>{receiptItem.documentoCliente || 'Mostrador'}</span></p>
                  <p className="flex justify-between"><span>Método:</span> <span>{receiptItem.metodoPago || 'No esp.'}</span></p>
                </div>
                <div className="space-y-2 text-sm font-mono mb-6">
                  <p className="flex justify-between font-bold text-slate-900"><span className="truncate pr-4">{receiptItem.sku} (x{receiptItem.cantidad})</span></p>
                </div>
                <div className="text-xl font-black text-slate-900 flex justify-between border-t pt-4 border-slate-900">
                  <span>TOTAL:</span> <span>S/ {Number(receiptItem.precioTotal || 0).toFixed(2)}</span>
                </div>
                <div className="mt-8 text-center print:hidden">
                  <button onClick={handlePrintReceipt} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 transition-colors"><Printer className="w-5 h-5"/> Imprimir Ticket POS</button>
                </div>
              </div>
            </div>
          )}

          {editingItem && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 print:hidden">
              <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 md:p-8 relative">
                <button onClick={() => setEditingItem(null)} className="absolute top-6 right-6 text-slate-400 bg-slate-100 rounded-full p-1"><X className="w-6 h-6" /></button>
                <h2 className="text-2xl font-black text-slate-900 mb-6"><Edit2 className="w-6 h-6 inline mr-2 text-indigo-600" /> Corregir {editingItem.type === 'productos' ? 'Catálogo' : ''}</h2>
                <form onSubmit={handleUpdateItem} className="space-y-5">
                  {editingItem.type !== 'productos' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">Cant</label>
                        <input required type="number" min="1" value={editingItem.data.cantidad} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, cantidad: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      
                      {editingItem.type === 'salidas' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-2">Total (S/)</label>
                          <input type="number" step="0.01" value={editingItem.data.precioTotal || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, precioTotal: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                      )}

                      {editingItem.type === 'ingresos' && (
                        <>
                          <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-2">ID de Lote</label>
                            <input type="text" value={editingItem.data.loteId || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, loteId: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                          </div>
                          <div className="col-span-2 grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-2">Costo FOB Total</label>
                              <input type="number" step="0.01" value={editingItem.data.costoFob || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, costoFob: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-2">Flete</label>
                              <input type="number" step="0.01" value={editingItem.data.flete || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, flete: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-2">Aduanas</label>
                              <input type="number" step="0.01" value={editingItem.data.aduanas || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, aduanas: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-2">IGV</label>
                              <input type="number" step="0.01" value={editingItem.data.igv || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, igv: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                          </div>
                        </>
                      )}

                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Fecha Lógica (Operación)</label>
                        <input type="date" value={editingItem.data.fechaOperacion || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, fechaOperacion: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div><label className="block text-xs font-bold text-slate-500 mb-2">Nombre del Producto</label><input required value={editingItem.data.nombre || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, nombre: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-2">URL de Imagen</label><input value={editingItem.data.imagen || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, imagen: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="https://..." /></div>
                      <div><label className="block text-xs font-bold text-slate-500 mb-2">Descripción</label><textarea value={editingItem.data.descripcion || ''} onChange={e => setEditingItem({ ...editingItem, data: { ...editingItem.data, descripcion: e.target.value } })} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" rows="3"></textarea></div>
                    </div>
                  )}
                  <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-colors">Guardar Cambios</button>
                </form>
              </div>
            </div>
          )}

          {viewProductDetails && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
              <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden relative flex flex-col md:flex-row max-h-[90vh]">
                <button onClick={() => setViewProductDetails(null)} className="absolute top-4 right-4 bg-black/50 text-white rounded-full p-1 z-10 hover:bg-black transition-colors"><X className="w-6 h-6"/></button>
                <div className="md:w-1/2 bg-slate-100 flex items-center justify-center min-h-[250px] md:min-h-[400px]">
                   {viewProductDetails.imagen ? (
                      <img src={viewProductDetails.imagen} alt={viewProductDetails.nombre} className="w-full h-full object-cover" />
                   ) : (
                      <div className="text-slate-400 flex flex-col items-center"><Camera className="w-16 h-16 mb-2 opacity-50"/> <span>Sin imagen</span></div>
                   )}
                </div>
                <div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-center overflow-y-auto">
                   <div className="text-xs font-bold tracking-widest text-indigo-500 mb-2">{viewProductDetails.sku}</div>
                   <h2 className="text-2xl font-black text-slate-900 leading-tight mb-3">{viewProductDetails.nombre}</h2>
                   <div className="flex gap-2 mb-6">
                      <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold">{viewProductDetails.marca}</span>
                      <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-xs font-bold">{viewProductDetails.categoria}</span>
                   </div>
                   <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Descripción del Producto</h3>
                      <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{viewProductDetails.descripcion || 'No se añadió descripción para este artículo.'}</p>
                   </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
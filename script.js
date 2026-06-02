// --- VALIDACIÓN DE LIBRERÍAS CDN (SOLUCIÓN MÓVIL) ---
const librariesLoaded = typeof firebase !== 'undefined' && typeof L !== 'undefined';

if (!librariesLoaded) {
    console.error("Error: Las librerías de Firebase o Leaflet no se cargaron correctamente.");
    window.onload = () => {
        const errorBanner = document.createElement('div');
        errorBanner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: #ef4444;
            color: white;
            padding: 15px;
            text-align: center;
            font-weight: bold;
            z-index: 9999;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            font-family: 'Inter', sans-serif;
        `;
        errorBanner.textContent = "⚠️ Error de conexión: No se pudieron cargar los servicios de mapas o base de datos. Asegúrate de estar conectado a Internet.";
        document.body.insertBefore(errorBanner, document.body.firstChild);
    };
    throw new Error("Librerías externas no cargadas. Se detiene la inicialización de SafeUSM.");
}

const firebaseConfig = {
    apiKey: "AIzaSyDzA82S6v-6x_gXue8Q1LgOZLB7lJrLhYY",
    authDomain: "safeusm.firebaseapp.com",
    projectId: "safeusm",
    storageBucket: "safeusm.firebasestorage.app",
    messagingSenderId: "488287141022",
    appId: "1:488287141022:web:3ca4efe8c394a7429d8f8f",
    measurementId: "G-5S3J58FPB6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const storage = firebase.storage();

let categoriaSeleccionada = "";
let currentUserEmail = null;

// --- LÓGICA DE AUTENTICACIÓN ---
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const loginSection = document.getElementById('login-section');
const userInfoSection = document.getElementById('user-info-section');
const uploadContainer = document.getElementById('upload-container');
const userEmailText = document.getElementById('user-email');

// --- ELEMENTOS DE VISTA PREVIA DE IMAGEN ---
const fileInput = document.getElementById('photo-upload');
const uploadBtnText = document.getElementById('upload-btn-text');
const previewContainer = document.getElementById('image-preview-container');
const previewImage = document.getElementById('image-preview');
const btnRemovePhoto = document.getElementById('btn-remove-photo');

btnLogin.addEventListener('click', () => {
    auth.signInWithPopup(provider).catch(error => {
        Swal.fire('Error', 'No se pudo iniciar sesión: ' + error.message, 'error');
    });
});

btnLogout.addEventListener('click', () => {
    auth.signOut();
});

/* DESACTIVADO TEMPORALMENTE PARA PRUEBAS DE FOTO
auth.onAuthStateChanged(user => {
    if (user) {
        if (user.email.endsWith('@usm.cl') || user.email.endsWith('@sansano.usm.cl')) {
            currentUserEmail = user.email;
            userEmailText.textContent = `Conectado como: ${user.email}`;
            loginSection.style.display = 'none';
            userInfoSection.style.display = 'flex';
            uploadContainer.style.display = 'flex';
            // Invalidar el tamaño del mapa para que se dibuje correctamente al mostrarse
            setTimeout(() => { formMap.invalidateSize(); }, 300);
        } else {
            auth.signOut();
            Swal.fire('Acceso Denegado', 'Debes usar un correo institucional de la USM (@usm.cl o @sansano.usm.cl).', 'error');
        }
    } else {
        currentUserEmail = null;
        loginSection.style.display = 'flex';
        userInfoSection.style.display = 'none';
        uploadContainer.style.display = 'none';
    }
});
*/

// Forzamos el nombre de usuario para que no falle el reporte mientras probamos sin login
currentUserEmail = "usuario_de_prueba@sansano.usm.cl";

// --- FUNCIÓN AUXILIAR: PUNTO EN POLÍGONO (Ray-casting Algorithm) ---
function isPointInPolygon(lat, lng, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const latI = polygon[i][0];
        const lngI = polygon[i][1];
        const latJ = polygon[j][0];
        const lngJ = polygon[j][1];
        
        const intersect = ((lngI > lng) !== (lngJ > lng))
            && (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI) + latI);
        if (intersect) inside = !inside;
    }
    return inside;
}

// --- MAPAS LEAFLET ---
const usmSanJoaquin = [-33.4906, -70.6192]; // Centro real del Campus San Joaquín
let currentLat = usmSanJoaquin[0];
let currentLng = usmSanJoaquin[1];

// Límites geográficos estrictos del campus San Joaquín
const boundsSanJoaquin = L.latLngBounds(
    L.latLng(-33.4925, -70.6218), // Esquina Suroeste
    L.latLng(-33.4887, -70.6166)  // Esquina Noreste
);

// Opciones de configuración para restringir la navegación al campus
const mapOptions = {
    maxBounds: boundsSanJoaquin,
    maxBoundsViscosity: 1.0, // Impide arrastrar el mapa fuera de los límites
    minZoom: 17,             // Restringe zoom hacia afuera para mantener el campus en pantalla
    maxZoom: 19              // Límite de zoom de acercamiento
};

// Coordenadas del polígono del límite del campus (según OSM way 157450164)
const campusCoordinates = [
    [-33.4899900, -70.6205564],
    [-33.4899363, -70.6202862],
    [-33.4897656, -70.6203226],
    [-33.4894393, -70.6183822],
    [-33.4905566, -70.6181177],
    [-33.4915911, -70.6179077],
    [-33.4916687, -70.6180900],
    [-33.4917169, -70.6183798],
    [-33.4917723, -70.6188565],
    [-33.4917415, -70.6198651],
    [-33.4905671, -70.6201173],
    [-33.4905269, -70.6204940],
    [-33.4903703, -70.6204726],
    [-33.4899900, -70.6205564]
];

// 1. Mapa del Formulario
const formMap = L.map('form-map', mapOptions).setView(usmSanJoaquin, 17);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap'
}).addTo(formMap);

// Polígono del campus en el mapa del formulario
L.polygon(campusCoordinates, {
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.08,
    weight: 2,
    dashArray: '5, 8'
}).addTo(formMap);

const formMarker = L.marker(usmSanJoaquin, {draggable: true}).addTo(formMap);
formMarker.on('dragend', function(e) {
    const pos = formMarker.getLatLng();
    // Validar que el marcador arrastrado esté dentro del polígono del campus (zona azul)
    if (isPointInPolygon(pos.lat, pos.lng, campusCoordinates)) {
        currentLat = pos.lat;
        currentLng = pos.lng;
    } else {
        // Devolver el marcador al centro si se arrastra fuera
        formMarker.setLatLng(usmSanJoaquin);
        currentLat = usmSanJoaquin[0];
        currentLng = usmSanJoaquin[1];
        Swal.fire('Ubicación Inválida', 'Por favor, arrastra el marcador dentro del área del campus delimitada en azul.', 'warning');
    }
});

formMap.on('click', function(e) {
    // Validar que el clic esté dentro del polígono del campus (zona azul)
    if (isPointInPolygon(e.latlng.lat, e.latlng.lng, campusCoordinates)) {
        formMarker.setLatLng(e.latlng);
        currentLat = e.latlng.lat;
        currentLng = e.latlng.lng;
    } else {
        Swal.fire('Ubicación Inválida', 'Debes hacer clic dentro de la zona del campus delimitada en azul.', 'warning');
    }
});

// Botón de Geolocalización
const btnLocation = document.getElementById('btn-location');
const locationStatus = document.getElementById('location-status');
btnLocation.addEventListener('click', () => {
    locationStatus.textContent = "Obteniendo ubicación...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                // Validar que la ubicación geolocalizada esté dentro del polígono del campus
                if (isPointInPolygon(userLat, userLng, campusCoordinates)) {
                    currentLat = userLat;
                    currentLng = userLng;
                    const newPos = [currentLat, currentLng];
                    formMap.setView(newPos, 18);
                    formMarker.setLatLng(newPos);
                    locationStatus.textContent = "Ubicación obtenida.";
                } else {
                    locationStatus.textContent = "Ubicación fuera del campus.";
                    Swal.fire('Ubicación Fuera de Rango', 'Tu ubicación actual está fuera del área del campus delimitada en azul. El marcador se mantendrá en el centro del campus.', 'warning');
                }
            },
            (error) => {
                locationStatus.textContent = "Error al obtener ubicación.";
                Swal.fire('Error', 'No se pudo obtener tu ubicación.', 'error');
            }
        );
    } else {
        locationStatus.textContent = "Tu navegador no soporta geolocalización.";
    }
});

// 2. Mapa Global (Dashboard)
const globalMap = L.map('global-map', mapOptions).setView(usmSanJoaquin, 17);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap'
}).addTo(globalMap);

// Polígono del campus en el mapa global
L.polygon(campusCoordinates, {
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.08,
    weight: 2,
    dashArray: '5, 8'
}).addTo(globalMap);

let globalMarkers = []; // Array para guardar los pines actuales

// --- NAVEGACIÓN ENTRE PÁGINAS (SPA) ---
const pageHome = document.getElementById('page-home');
const pageReportForm = document.getElementById('page-report-form');
const pageReportsList = document.getElementById('page-reports-list');
const pageLoginCustom = document.getElementById('page-login-custom');
const pageCredentialsList = document.getElementById('page-credentials-list');
const pageProfile = document.getElementById('page-profile');
const pageEditProfile = document.getElementById('page-edit-profile');

const btnGotoReport = document.getElementById('btn-goto-report');
const btnGotoList = document.getElementById('btn-goto-list');
const btnHomeLogin = document.getElementById('btn-home-login');
const btnGotoCredentials = document.getElementById('btn-goto-credentials');
const btnBackCredentials = document.getElementById('btn-back-credentials');
const btnBackProfile = document.getElementById('btn-back-profile');
const btnBackEditProfile = document.getElementById('btn-back-edit-profile');
const backBtns = document.querySelectorAll('.back-btn');

let myReportsUnsubscribe = null; // Guardar la desuscripción de reportes del perfil

function navigateTo(pageId) {
    // Desuscribirse de reportes del perfil si salimos de él
    if (pageId !== 'page-profile' && pageId !== 'page-edit-profile' && myReportsUnsubscribe) {
        myReportsUnsubscribe();
        myReportsUnsubscribe = null;
    }

    // Ocultar todas las páginas
    [pageHome, pageReportForm, pageReportsList, pageLoginCustom, pageCredentialsList, pageProfile, pageEditProfile].forEach(page => {
        if (page) {
            page.style.display = 'none';
            page.classList.remove('active');
        }
    });

    // Mostrar la página destino
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.style.display = 'flex';
        targetPage.classList.add('active');

        // Toggle visibilidad del botón de cerrar sesión custom en la Página 4
        if (pageId === 'page-login-custom') {
            const btnCustomLogout = document.getElementById('btn-custom-logout');
            if (btnCustomLogout) {
                if (localStorage.getItem('custom-user-email')) {
                    btnCustomLogout.style.display = 'inline-flex';
                } else {
                    btnCustomLogout.style.display = 'none';
                }
            }
            // Restablecer el formulario al modo login por defecto
            if (typeof setLoginMode === 'function') {
                setLoginMode('login');
            }
        }

        // Cargar los datos del perfil si entramos en la Página 6
        if (pageId === 'page-profile') {
            if (typeof loadUserProfile === 'function') {
                loadUserProfile();
            }
        }

        // Cargar los datos a editar si entramos en la Página 7
        if (pageId === 'page-edit-profile') {
            if (typeof loadEditProfileFields === 'function') {
                loadEditProfileFields();
            }
        }

        // Invalidar tamaños de mapas según corresponda (crítico para Leaflet)
        if (pageId === 'page-reports-list' && typeof globalMap !== 'undefined') {
            setTimeout(() => {
                globalMap.invalidateSize();
            }, 100);
        } else if (pageId === 'page-report-form' && typeof formMap !== 'undefined') {
            setTimeout(() => {
                formMap.invalidateSize();
            }, 100);
        }
    }
}

if (btnGotoReport) {
    btnGotoReport.addEventListener('click', () => navigateTo('page-report-form'));
}
if (btnGotoList) {
    btnGotoList.addEventListener('click', () => navigateTo('page-reports-list'));
}
if (btnHomeLogin) {
    btnHomeLogin.addEventListener('click', () => {
        if (localStorage.getItem('custom-user-email')) {
            navigateTo('page-profile');
        } else {
            navigateTo('page-login-custom');
        }
    });
}
if (btnGotoCredentials) {
    btnGotoCredentials.addEventListener('click', () => {
        Swal.fire({
            title: 'Acceso Restringido',
            text: 'Ingresa la contraseña de administrador para ver el registro:',
            input: 'password',
            inputAttributes: {
                autocapitalize: 'off',
                autocorrect: 'off'
            },
            showCancelButton: true,
            confirmButtonText: 'Entrar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#3b82f6',
            background: 'rgba(15, 23, 42, 0.9)'
        }).then((result) => {
            if (result.isConfirmed) {
                if (result.value === '9876') {
                    navigateTo('page-credentials-list');
                } else {
                    Swal.fire({
                        title: 'Acceso Denegado',
                        text: 'Contraseña incorrecta.',
                        icon: 'error',
                        confirmButtonColor: '#3b82f6',
                        background: 'rgba(15, 23, 42, 0.9)'
                    }).then(() => {
                        navigateTo('page-home');
                    });
                }
            } else {
                navigateTo('page-home');
            }
        });
    });
}
if (btnBackCredentials) {
    btnBackCredentials.addEventListener('click', () => navigateTo('page-login-custom'));
}
if (btnBackProfile) {
    btnBackProfile.addEventListener('click', () => navigateTo('page-home'));
}
if (btnBackEditProfile) {
    btnBackEditProfile.addEventListener('click', () => navigateTo('page-profile'));
}
backBtns.forEach(btn => {
    if (btn.id !== 'btn-back-credentials' && btn.id !== 'btn-back-profile' && btn.id !== 'btn-back-edit-profile') {
        btn.addEventListener('click', () => navigateTo('page-home'));
    }
});

let isFirstLoad = true; // Para no lanzar alertas al cargar la página por primera vez
const btnEnviar = document.getElementById('send-btn');
const inputComentario = document.getElementById('user-comment');
const botonesCategoria = document.querySelectorAll('.cat-btn');



botonesCategoria.forEach(boton => {
    boton.addEventListener('click', (e) => {
        categoriaSeleccionada = e.target.getAttribute('data-category');

        botonesCategoria.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Efecto de bordes
        botonesCategoria.forEach(b => b.style.border = "none");
        e.target.style.border = "2px solid white";
    });
});

btnEnviar.addEventListener('click', async () => {
    // Validar que la ubicación esté estrictamente dentro del polígono del campus (zona azul)
    if (!isPointInPolygon(currentLat, currentLng, campusCoordinates)) {
        Swal.fire('Ubicación Inválida', 'No puedes publicar el reporte si el marcador no está dentro del campus de la universidad (delimitado en azul).', 'error');
        return;
    }

    const comentario = inputComentario.value;
    const file = fileInput.files[0];

    if (comentario.trim() === "" || categoriaSeleccionada === "") {
        Swal.fire('Faltan Datos', 'Por favor, escribe un comentario y selecciona una categoría (Seguridad, Salud o Género).', 'warning');
        return;
    }
    
    if (!file) {
        Swal.fire('Falta Foto', 'Por favor, selecciona una foto para el reporte.', 'warning');
        return;
    }

    btnEnviar.disabled = true;
    btnEnviar.innerHTML = 'Subiendo...';

    try {
        // 1. Subir la foto a Storage
        Swal.fire({
            title: 'Subiendo archivo...', 
            text: 'Por favor espera', 
            allowOutsideClick: false, 
            didOpen: () => { Swal.showLoading() }
        });

        const storageRef = storage.ref();
        const fileRef = storageRef.child(`reportes/${Date.now()}_${file.name}`);
        await fileRef.put(file);
        
        // 2. Obtener la URL de descarga real
        const urlDescarga = await fileRef.getDownloadURL();

        const activeUser = localStorage.getItem('custom-user-email') || currentUserEmail;
        const activeUserName = localStorage.getItem('custom-user-name') || activeUser.split('@')[0];

        // 3. Guardar en la colección "reportes" de Firestore
        await db.collection("reportes").add({
            texto: comentario,
            categoria: categoriaSeleccionada,
            fecha: new Date(),
            fotoUrl: urlDescarga,
            latitud: currentLat,
            longitud: currentLng,
            autor: activeUser,
            autorNombre: activeUserName
        });
        
        Swal.fire({
            title: '¡Reporte Enviado!',
            text: 'El aviso y la foto ya están en el sistema.',
            icon: 'success',
            confirmButtonColor: '#3b82f6',
            background: 'rgba(15, 23, 42, 0.9)'
        }).then(() => {
            navigateTo('page-reports-list');
        });
        
        // Limpiamos los campos
        inputComentario.value = "";
        categoriaSeleccionada = "";
        fileInput.value = "";
        botonesCategoria.forEach(b => {
            b.classList.remove('active');
            b.style.border = "none";
        });
        
        // Limpiar vista previa de imagen
        previewContainer.style.display = 'none';
        previewImage.src = '';
        if (uploadBtnText) uploadBtnText.textContent = 'Elegir Foto';

    } catch (error) {
        console.error("Hubo un error:", error);
        Swal.fire('Error', 'Hubo un error al enviar: ' + error.message, 'error');
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = `<span>Publicar Reporte</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>`;
    }
});

// 5. FUNCIÓN PARA MOSTRAR LOS REPORTES EN TIEMPO REAL
const listaReportes = document.getElementById('preview-container');

// Estructura de estado para filtros
let currentReports = [];
let activeCategoryFilter = "all";
let activeSpecialFilter = "all"; // "all", "today", "active"

// Estructura para almacenar desuscripciones de comentarios anteriores
let commentUnsubscribes = {};

// Escucha de botones de filtro en la UI
const filterButtons = document.querySelectorAll('.filter-btn');
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-filter-type');
        const val = btn.getAttribute('data-filter-val');
        
        if (type === 'category') {
            document.querySelectorAll('.filter-btn[data-filter-type="category"]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategoryFilter = val;
        } else if (type === 'special') {
            // Comportamiento toggle para filtros especiales
            if (activeSpecialFilter === val) {
                btn.classList.remove('active');
                activeSpecialFilter = 'all';
            } else {
                document.querySelectorAll('.filter-btn[data-filter-type="special"]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeSpecialFilter = val;
            }
        }
        
        renderFilteredReports();
    });
});

// Función central para filtrar y renderizar reportes y marcadores en el mapa
function renderFilteredReports() {
    // Desuscribirse de todos los listeners de comentarios anteriores para evitar fugas de memoria
    Object.values(commentUnsubscribes).forEach(unsub => unsub());
    commentUnsubscribes = {};

    // Limpiamos el contenedor y los pines del mapa antes de volver a llenarlo
    listaReportes.innerHTML = "";
    globalMarkers.forEach(marker => globalMap.removeLayer(marker));
    globalMarkers = [];

    // 1. Filtrar los reportes en base a la selección activa
    let filtered = [...currentReports];

    // Filtrar por categoría
    if (activeCategoryFilter !== "all") {
        filtered = filtered.filter(r => r.categoria === activeCategoryFilter);
    }

    // Filtrar por condiciones especiales
    if (activeSpecialFilter === "today") {
        const today = new Date();
        filtered = filtered.filter(r => {
            if (!r.fecha) return false;
            const rDate = r.fecha.toDate();
            return rDate.getDate() === today.getDate() &&
                   rDate.getMonth() === today.getMonth() &&
                   rDate.getFullYear() === today.getFullYear();
        });
    } else if (activeSpecialFilter === "active") {
        // Un reporte se considera activo/urgente si tiene 3 o más confirmaciones ciudadanas
        filtered = filtered.filter(r => (r.confirmations || 0) >= 3);
    }

    if (filtered.length === 0) {
        listaReportes.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.3); padding: 3rem; font-size: 0.95rem;">No hay reportes que coincidan con los filtros seleccionados.</p>`;
        return;
    }

    // 2. Renderizar los reportes filtrados
    filtered.forEach((reporte) => {
        const reporteId = reporte.id;
        const confirmations = reporte.confirmations || 0;

        // Ajustar el tamaño y animación del pin según confirmaciones
        let radius = 10;
        let weight = 2;
        let className = "";

        if (confirmations >= 5) {
            radius = 16;              // Más grande
            weight = 4;               // Borde más grueso
            className = "pulse-marker"; // Animación CSS de parpadeo
        } else if (confirmations >= 2) {
            radius = 13;
            weight = 3;
        }

        // Agregar Pin al Mapa Global
        if (reporte.latitud && reporte.longitud) {
            const marker = L.circleMarker([reporte.latitud, reporte.longitud], {
                color: getColor(reporte.categoria),
                fillColor: getColor(reporte.categoria),
                fillOpacity: 0.7,
                radius: radius,
                weight: weight,
                className: className
            }).addTo(globalMap);
            
            let popupContent = `<h3>${reporte.categoria}</h3>
                                <p>${reporte.texto}</p>
                                <div style="margin-top: 5px; font-weight: bold; color: ${confirmations >= 5 ? '#ef4444' : '#60a5fa'}">
                                    🔥 ${confirmations} Confirmaciones
                                </div>`;
            marker.bindPopup(popupContent);
            globalMarkers.push(marker);
        }

        // Comprobar si al usuario ya le gusta este reporte o si ya lo confirmó
        const reportIsLiked = localStorage.getItem('liked_report_' + reporteId) === 'true';
        const reportIsConfirmed = localStorage.getItem('confirmed_report_' + reporteId) === 'true';

        // Creamos el diseño de cada tarjeta
        const tarjeta = document.createElement('div');
        tarjeta.className = 'report-card'; // Usamos tu clase de estilo para los reportes
        tarjeta.style.borderLeft = "5px solid " + getColor(reporte.categoria);
        tarjeta.style.position = "relative";

        // Destacar visualmente reportes con alta urgencia (5+ confirmaciones)
        if (confirmations >= 5) {
            tarjeta.style.border = "1px solid rgba(239, 68, 68, 0.4)";
            tarjeta.style.borderLeft = "6px solid var(--danger)";
            tarjeta.style.boxShadow = "0 0 15px rgba(239, 68, 68, 0.2)";
        }

        let ubicacionTexto = reporte.latitud ? "📌 Ubicación Adjunta" : "📍 Sin ubicación";
        const displayName = reporte.autorNombre || reporte.autor || 'Anónimo';
        let autorHtml = `<div style="color: #64748b; font-size: 0.8em; margin-bottom: 5px;">Reportado por: ${displayName}</div>`;
        let imgHtml = reporte.fotoUrl && reporte.fotoUrl.startsWith("http") ? `<img src="${reporte.fotoUrl}" class="report-img" alt="Foto del reporte">` : '';

        tarjeta.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h3 style="color: white; margin-bottom: 5px; display: inline-flex; align-items: center; gap: 8px;">
                    ${reporte.categoria}
                    ${confirmations >= 5 ? '<span style="background: var(--danger); color: white; font-size: 0.6em; padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">⚠️ CRÍTICO</span>' : ''}
                </h3>
                <small style="color: ${getColor(reporte.categoria)}; font-size: 0.8em; border: 1px solid ${getColor(reporte.categoria)}; padding: 2px 6px; border-radius: 10px;">${ubicacionTexto}</small>
            </div>
            ${autorHtml}
            <p style="color: #ccc; font-size: 0.9em; margin-bottom: 10px; margin-top: 10px;">${reporte.texto}</p>
            ${imgHtml}
            <div style="margin-top: 10px;"><small style="color: #888;">${reporte.fecha ? reporte.fecha.toDate().toLocaleString() : 'Fecha desconocida'}</small></div>
            
            <!-- Acciones: Me Gusta, Confirmar e Hilo de Comentarios -->
            <div class="report-actions" style="flex-wrap: wrap; gap: 0.75rem;">
                <button class="report-action-btn like-btn ${reportIsLiked ? 'active' : ''}" title="Me gusta">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${reportIsLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${reporte.likes || 0}</span>
                </button>
                <button class="report-action-btn confirm-btn ${reportIsConfirmed ? 'active' : ''}" title="Yo también lo vi">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${reportIsConfirmed ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span>Confirmar (${confirmations})</span>
                </button>
                <button class="report-action-btn comments-toggle-btn" title="Comentarios">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                    </svg>
                    <span id="comment-count-${reporteId}">0</span>
                </button>
            </div>
            
            <!-- Sección Colapsable de Comentarios -->
            <div class="comments-section" style="display: none;">
                <div class="comments-list" id="comments-list-${reporteId}">
                    <p class="no-comments">Cargando comentarios...</p>
                </div>
                <form class="comment-form" style="flex-direction: column; gap: 0.5rem;">
                    <div style="display: flex; gap: 0.5rem; width: 100%;">
                        <input type="text" class="comment-input" placeholder="Escribe un comentario..." required>
                        <button type="submit" class="comment-submit-btn" title="Enviar comentario">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                    
                    <!-- Controles de Respuesta Oficial -->
                    <div class="official-comment-controls">
                        <label class="official-toggle-label">
                            <input type="checkbox" class="official-check" style="cursor: pointer;">
                            👮 Responder como Personal del Campus (Simulación)
                        </label>
                        <div class="official-fields" style="display: none; align-items: center; gap: 0.4rem; width: 100%; margin-top: 4px;">
                            <select class="official-select">
                                <option value="Guardia de Seguridad">👮 Guardia de Seguridad</option>
                                <option value="Personal de Enfermería">🩺 Enfermería</option>
                                <option value="Administración Campus">🏛️ Administración</option>
                            </select>
                            <input type="password" class="official-pin" placeholder="PIN Oficial (1234)" style="width: 120px;">
                        </div>
                    </div>
                </form>
            </div>
        `;

        // --- MANEJADORES DE EVENTOS DE CADA TARJETA ---

        // 1. Clic en "Me Gusta" del Reporte
        const likeBtn = tarjeta.querySelector('.like-btn');
        likeBtn.addEventListener('click', () => {
            const isCurrentlyLiked = localStorage.getItem('liked_report_' + reporteId) === 'true';
            const reportRef = db.collection("reportes").doc(reporteId);
            if (isCurrentlyLiked) {
                localStorage.removeItem('liked_report_' + reporteId);
                reportRef.update({ likes: firebase.firestore.FieldValue.increment(-1) });
            } else {
                localStorage.setItem('liked_report_' + reporteId, 'true');
                reportRef.update({ likes: firebase.firestore.FieldValue.increment(1) });
            }
        });

        // 2. Clic en "Confirmar" (Validación Ciudadana)
        const confirmBtn = tarjeta.querySelector('.confirm-btn');
        confirmBtn.addEventListener('click', () => {
            const isCurrentlyConfirmed = localStorage.getItem('confirmed_report_' + reporteId) === 'true';
            const reportRef = db.collection("reportes").doc(reporteId);
            if (isCurrentlyConfirmed) {
                localStorage.removeItem('confirmed_report_' + reporteId);
                reportRef.update({ confirmations: firebase.firestore.FieldValue.increment(-1) });
            } else {
                localStorage.setItem('confirmed_report_' + reporteId, 'true');
                reportRef.update({ confirmations: firebase.firestore.FieldValue.increment(1) });
            }
        });

        // 3. Colapsar/Desplegar comentarios
        const toggleBtn = tarjeta.querySelector('.comments-toggle-btn');
        const commentsSection = tarjeta.querySelector('.comments-section');
        toggleBtn.addEventListener('click', () => {
            const isHidden = commentsSection.style.display === 'none';
            commentsSection.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                setTimeout(() => {
                    commentsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }
        });

        // 4. Mostrar/Ocultar campos de comentario oficial
        const officialCheck = tarjeta.querySelector('.official-check');
        const officialFields = tarjeta.querySelector('.official-fields');
        officialCheck.addEventListener('change', () => {
            officialFields.style.display = officialCheck.checked ? 'flex' : 'none';
        });

        // 5. Enviar Comentario (con soporte de perfiles oficiales)
        const commentForm = tarjeta.querySelector('.comment-form');
        commentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = commentForm.querySelector('.comment-input');
            const text = input.value.trim();
            
            const isOfficial = officialCheck.checked;
            let role = "Normal";
            
            if (isOfficial) {
                const selectRole = commentForm.querySelector('.official-select').value;
                const pin = commentForm.querySelector('.official-pin').value;
                
                if (pin !== "1234") {
                    Swal.fire({
                        title: 'PIN Incorrecto',
                        text: 'El PIN de personal oficial ingresado no es válido (Sugerencia: usa 1234).',
                        icon: 'error',
                        confirmButtonColor: '#3b82f6',
                        background: 'rgba(15, 23, 42, 0.9)'
                    });
                    return;
                }
                role = selectRole;
            }
            
            if (text) {
                db.collection("reportes").doc(reporteId).collection("comentarios").add({
                    texto: text,
                    fecha: new Date(),
                    autor: currentUserEmail || "Anónimo",
                    likes: 0,
                    esOficial: isOfficial,
                    rolOficial: role
                }).then(() => {
                    input.value = '';
                    officialCheck.checked = false;
                    officialFields.style.display = 'none';
                    commentForm.querySelector('.official-pin').value = '';
                }).catch(error => {
                    Swal.fire('Error', 'No se pudo publicar el comentario: ' + error.message, 'error');
                });
            }
        });

        // 6. Suscribirse a comentarios en tiempo real
        const unsubComments = db.collection("reportes").doc(reporteId).collection("comentarios").orderBy("fecha", "asc").onSnapshot((commentsSnapshot) => {
            const commentsList = tarjeta.querySelector(`.comments-list`);
            const badge = tarjeta.querySelector(`#comment-count-${reporteId}`);
            
            if (badge) {
                badge.textContent = commentsSnapshot.size;
            }
            
            if (commentsList) {
                commentsList.innerHTML = "";
                if (commentsSnapshot.empty) {
                    commentsList.innerHTML = `<p class="no-comments">Sin comentarios aún.</p>`;
                    return;
                }
                
                commentsSnapshot.forEach((commentDoc) => {
                    const commentId = commentDoc.id;
                    const commentData = commentDoc.data();
                    const commentIsLiked = localStorage.getItem('liked_comment_' + commentId) === 'true';
                    
                    const commentDiv = document.createElement('div');
                    
                    // Clase especial si es oficial
                    if (commentData.esOficial) {
                        commentDiv.className = 'comment-item official';
                    } else {
                        commentDiv.className = 'comment-item';
                    }
                    
                    let metaBadge = '';
                    if (commentData.esOficial) {
                        let emoji = '👮';
                        if (commentData.rolOficial.includes('Enfermería')) emoji = '🩺';
                        if (commentData.rolOficial.includes('Administración')) emoji = '🏛️';
                        metaBadge = `<span class="official-badge">${emoji} ${commentData.rolOficial}</span>`;
                    }
                    
                    commentDiv.innerHTML = `
                        <div class="comment-content">
                            <div class="comment-meta">
                                <span class="comment-author">${commentData.autor || 'Anónimo'}</span>
                                ${metaBadge}
                                <span class="comment-date">${commentData.fecha ? commentData.fecha.toDate().toLocaleDateString() : ''}</span>
                            </div>
                            <p class="comment-text" style="${commentData.esOficial ? 'font-weight: 600; color: #fef08a;' : ''}">${commentData.texto}</p>
                        </div>
                        <button class="comment-like-btn ${commentIsLiked ? 'active' : ''}" title="Me gusta">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="${commentIsLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            <span>${commentData.likes || 0}</span>
                        </button>
                    `;
                    
                    // Click para Like en el Comentario
                    const commentLikeBtn = commentDiv.querySelector('.comment-like-btn');
                    commentLikeBtn.addEventListener('click', () => {
                        const isCurrentlyLiked = localStorage.getItem('liked_comment_' + commentId) === 'true';
                        const commentRef = db.collection("reportes").doc(reporteId).collection("comentarios").doc(commentId);
                        if (isCurrentlyLiked) {
                            localStorage.removeItem('liked_comment_' + commentId);
                            commentRef.update({ likes: firebase.firestore.FieldValue.increment(-1) });
                        } else {
                            localStorage.setItem('liked_comment_' + commentId, 'true');
                            commentRef.update({ likes: firebase.firestore.FieldValue.increment(1) });
                        }
                    });
                    
                    commentsList.appendChild(commentDiv);
                });
            }
        });

        // Guardamos la desuscripción en el mapa global
        commentUnsubscribes[reporteId] = unsubComments;
        listaReportes.appendChild(tarjeta);
    });
}

// Esta función lee los datos de Firestore cada vez que hay un cambio
db.collection("reportes").orderBy("fecha", "desc").onSnapshot((snapshot) => {
    // Verificamos si hay cambios (nuevos reportes añadidos) para lanzar la alerta SweetAlert
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added" && !isFirstLoad) {
            const data = change.doc.data();
            
            // Verificación para Android Native Bridge o Web Notifications
            const hasAndroidBridge = typeof window.AndroidBridge !== "undefined";
            if (hasAndroidBridge || Notification.permission === "granted") {
                new Notification(`Nuevo Aviso: ${data.categoria}`, {
                    body: data.texto
                });
            }

            Swal.fire({
                title: `Nuevo Aviso: ${data.categoria}`,
                text: data.texto,
                icon: 'info',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 4500,
                timerProgressBar: true,
                background: 'rgba(15, 23, 42, 0.95)'
            });
            
            if (window.Notification && Notification.permission === "granted") {
                new Notification(`Nuevo Aviso: ${data.categoria}`, { body: data.texto });
            } else if (window.Notification && Notification.permission !== "denied") {
                Notification.requestPermission().then(permission => {
                    if (permission === "granted") {
                        new Notification(`Nuevo Aviso: ${data.categoria}`, { body: data.texto });
                    }
                });
            }
        }
    });

    // Actualizar el arreglo de reportes en memoria
    currentReports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Volver a aplicar los filtros y renderizar la interfaz
    renderFilteredReports();

    isFirstLoad = false;
    
    // Invalidamos el tamaño de los mapas por si hubo cambios de layout
    setTimeout(() => { 
        globalMap.invalidateSize(); 
        formMap.invalidateSize();
    }, 500);
});

// Función auxiliar para poner colores por categoría
function getColor(categoria) {
    switch (categoria) {
        case 'Seguridad': return '#ef4444'; // Rojo
        case 'Salud': return '#22c55e';    // Verde
        case 'Equidad de Género': return '#a855f7'; // Morado
        default: return '#6366f1';
    }
}

// --- MANEJO DE VISTA PREVIA DE LA IMAGEN ---
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
        // Validar que el archivo sea una imagen
        if (!file.type.startsWith('image/')) {
            Swal.fire({
                title: 'Archivo no válido',
                text: 'Por favor selecciona un archivo de tipo imagen.',
                icon: 'warning',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            fileInput.value = '';
            return;
        }

        // Validación de tamaño (20 MB máximo)
        const maxSizeInBytes = 20 * 1024 * 1024; // 20 MB
        if (file.size > maxSizeInBytes) {
            Swal.fire({
                title: 'Archivo demasiado grande',
                text: `Tu archivo pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB. El límite máximo permitido es de 20 MB.`,
                icon: 'warning',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            fileInput.value = ''; // Limpiamos el input
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.style.display = 'flex';
            if (uploadBtnText) uploadBtnText.textContent = 'Cambiar Foto';
            
            // Reajustar tamaño de los mapas por si el layout se desplaza
            setTimeout(() => {
                formMap.invalidateSize();
                globalMap.invalidateSize();
            }, 300);
        };
        reader.readAsDataURL(file);
    }
});

btnRemovePhoto.addEventListener('click', () => {
    fileInput.value = '';
    previewImage.src = '';
    previewContainer.style.display = 'none';
    if (uploadBtnText) uploadBtnText.textContent = 'Elegir Foto';
    
    // Reajustar tamaño de los mapas por si el layout se desplaza
    setTimeout(() => {
        formMap.invalidateSize();
        globalMap.invalidateSize();
    }, 300);
});

// --- LÓGICA DE ACCESIBILIDAD ---
const btnSettingsTriggers = document.querySelectorAll('.btn-settings-trigger');
const accessibilityModal = document.getElementById('accessibility-modal');
const btnCloseAccessibility = document.getElementById('btn-close-accessibility');
const accessBtns = document.querySelectorAll('.access-btn');

// Cargar preferencia guardada al inicio
const savedTheme = localStorage.getItem('safeusm-theme') || 'default';
if (savedTheme !== 'default') {
    document.documentElement.setAttribute('data-theme', savedTheme);
}
updateActiveAccessBtn(savedTheme);

// Cargar usuario custom si ya inició sesión
const savedCustomEmail = localStorage.getItem('custom-user-email');
if (savedCustomEmail) {
    const loginSpan = document.querySelector('#btn-home-login span');
    if (loginSpan) {
        const savedCustomName = localStorage.getItem('custom-user-name');
        loginSpan.textContent = savedCustomName ? savedCustomName.substring(0, 8) : savedCustomEmail.substring(0, 8);
    }
}

if (btnSettingsTriggers.length > 0 && accessibilityModal) {
    btnSettingsTriggers.forEach(btn => {
        btn.addEventListener('click', () => {
            accessibilityModal.style.display = 'flex';
        });
    });

    btnCloseAccessibility.addEventListener('click', () => {
        accessibilityModal.style.display = 'none';
    });

    accessBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const theme = e.target.getAttribute('data-theme');
            
            if (theme === 'default') {
                document.documentElement.removeAttribute('data-theme');
            } else {
                document.documentElement.setAttribute('data-theme', theme);
            }
            
            localStorage.setItem('safeusm-theme', theme);
            updateActiveAccessBtn(theme);
        });
    });
}

function updateActiveAccessBtn(theme) {
    accessBtns.forEach(btn => {
        if (btn.getAttribute('data-theme') === theme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// --- FUNCIÓN DE HASHING PARA CONTRASEÑAS (SHA-256) ---
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// --- LÓGICA DE LOGIN CUSTOM Y REGISTRO DE CREDENCIALES (PÁGINAS 4, 5 Y 6) ---
const inputCustomEmail = document.getElementById('custom-email');
const inputCustomPassword = document.getElementById('custom-password');
const inputCustomConfirmPassword = document.getElementById('custom-confirm-password');
const inputCustomName = document.getElementById('custom-name');
const btnSubmitLogin = document.getElementById('btn-submit-login');
const credentialsContainer = document.getElementById('credentials-container');

// Elementos de cambio de modo (Iniciar Sesión / Registrarse)
const tabLoginMode = document.getElementById('tab-login-mode');
const tabRegisterMode = document.getElementById('tab-register-mode');
const loginHeaderTitle = document.getElementById('login-header-title');
const loginHeaderSubtitle = document.getElementById('login-header-subtitle');
const confirmPasswordGroup = document.getElementById('confirm-password-group');
const nameGroup = document.getElementById('name-group');
const btnSubmitText = document.getElementById('btn-submit-text');
const btnSubmitIcon = document.getElementById('btn-submit-icon');

let currentLoginMode = 'login'; // 'login' o 'register'

function setLoginMode(mode) {
    currentLoginMode = mode;
    
    // Limpiar campos para evitar mezclas
    if (inputCustomPassword) inputCustomPassword.value = '';
    if (inputCustomConfirmPassword) inputCustomConfirmPassword.value = '';
    if (inputCustomName) inputCustomName.value = '';

    if (mode === 'login') {
        if (tabLoginMode) tabLoginMode.classList.add('active');
        if (tabRegisterMode) tabRegisterMode.classList.remove('active');
        if (loginHeaderTitle) loginHeaderTitle.textContent = "Iniciar Sesión";
        if (loginHeaderSubtitle) loginHeaderSubtitle.textContent = "Acceso institucional UTFSM";
        if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'none';
        if (nameGroup) nameGroup.style.display = 'none';
        if (inputCustomConfirmPassword) inputCustomConfirmPassword.removeAttribute('required');
        if (inputCustomName) inputCustomName.removeAttribute('required');
        if (btnSubmitText) btnSubmitText.textContent = "Entrar";
        if (btnSubmitIcon) {
            btnSubmitIcon.innerHTML = `
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
            `;
        }
    } else {
        if (tabLoginMode) tabLoginMode.classList.remove('active');
        if (tabRegisterMode) tabRegisterMode.classList.add('active');
        if (loginHeaderTitle) loginHeaderTitle.textContent = "Crear Cuenta";
        if (loginHeaderSubtitle) loginHeaderSubtitle.textContent = "Registra una cuenta institucional USM";
        if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
        if (nameGroup) nameGroup.style.display = 'block';
        if (inputCustomConfirmPassword) inputCustomConfirmPassword.setAttribute('required', 'true');
        if (inputCustomName) inputCustomName.setAttribute('required', 'true');
        if (btnSubmitText) btnSubmitText.textContent = "Crear Cuenta y Entrar";
        if (btnSubmitIcon) {
            btnSubmitIcon.innerHTML = `
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <line x1="19" y1="8" x2="19" y2="14"></line>
                <line x1="22" y1="11" x2="16" y2="11"></line>
            `;
        }
    }
}

if (tabLoginMode && tabRegisterMode) {
    tabLoginMode.addEventListener('click', () => setLoginMode('login'));
    tabRegisterMode.addEventListener('click', () => setLoginMode('register'));
}

if (btnSubmitLogin) {
    btnSubmitLogin.addEventListener('click', async () => {
        const email = inputCustomEmail.value.trim();
        const password = inputCustomPassword.value;
        const confirmPassword = inputCustomConfirmPassword ? inputCustomConfirmPassword.value : '';
        const name = inputCustomName ? inputCustomName.value.trim() : '';

        // Validaciones de entrada
        if (!email || !password) {
            Swal.fire({
                title: 'Campos Vacíos',
                text: 'Por favor, ingresa tanto tu correo como tu contraseña.',
                icon: 'warning',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        if (currentLoginMode === 'register' && !name) {
            Swal.fire({
                title: 'Campos Vacíos',
                text: 'Por favor, ingresa tu nombre completo.',
                icon: 'warning',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        if (currentLoginMode === 'register' && !confirmPassword) {
            Swal.fire({
                title: 'Campos Vacíos',
                text: 'Por favor, confirma tu contraseña.',
                icon: 'warning',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        // Validación de dominio institucional USM
        const emailRegex = /^[a-zA-Z0-9._%+-]+@(usm\.cl|sansano\.usm\.cl)$/i;
        if (!emailRegex.test(email)) {
            Swal.fire({
                title: 'Correo Inválido',
                text: 'Debes utilizar un correo institucional de la USM (@usm.cl o @sansano.usm.cl).',
                icon: 'error',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        if (currentLoginMode === 'register' && password !== confirmPassword) {
            Swal.fire({
                title: 'Contraseñas no coinciden',
                text: 'La contraseña y la confirmación no son iguales. Por favor, verifica.',
                icon: 'error',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        // Deshabilitar botón durante el proceso
        btnSubmitLogin.disabled = true;
        const originalBtnHTML = btnSubmitLogin.innerHTML;
        btnSubmitLogin.innerHTML = currentLoginMode === 'login' ? 'Verificando...' : 'Guardando...';

        try {
            // Hashing de la contraseña en el cliente
            const hashedPassword = await hashPassword(password);

            // Verificar si el correo ya existe
            const querySnapshot = await db.collection("credenciales_custom")
                                           .where("correo", "==", email)
                                           .get();

            let finalName = '';

            if (currentLoginMode === 'login') {
                // --- FLUJO DE INICIO DE SESIÓN ---
                if (querySnapshot.empty) {
                    Swal.fire({
                        title: 'Usuario No Registrado',
                        text: 'Este correo no está registrado en el sistema. Selecciona "Crear Cuenta" para registrarte.',
                        icon: 'warning',
                        confirmButtonColor: '#3b82f6',
                        background: 'rgba(15, 23, 42, 0.9)'
                    });
                    btnSubmitLogin.disabled = false;
                    btnSubmitLogin.innerHTML = originalBtnHTML;
                    return;
                }

                const userDoc = querySnapshot.docs[0];
                const docData = userDoc.data();
                const savedPassword = docData.contrasena;
                finalName = docData.nombre || email.split('@')[0];

                // Detectamos si la clave guardada es un hash SHA-256
                const isHashed = /^[0-9a-fA-F]{64}$/.test(savedPassword);
                let loginSuccess = false;

                if (isHashed) {
                    // Si está hasheada, comparamos los hashes
                    loginSuccess = (savedPassword === hashedPassword);
                } else {
                    // Si es texto plano (cuenta legacy), comparamos en texto plano
                    loginSuccess = (savedPassword === password);
                    
                    // Si es correcto, migramos automáticamente a Hash para mayor seguridad
                    if (loginSuccess) {
                        await db.collection("credenciales_custom").doc(userDoc.id).update({
                            contrasena: hashedPassword
                        });
                        console.log(`Contraseña migrada automáticamente a SHA-256 para ${email}`);
                    }
                }

                if (!loginSuccess) {
                    Swal.fire({
                        title: 'Contraseña Incorrecta',
                        text: 'La contraseña no coincide con la registrada. Por favor, reintente.',
                        icon: 'error',
                        confirmButtonColor: '#3b82f6',
                        background: 'rgba(15, 23, 42, 0.9)'
                    });
                    btnSubmitLogin.disabled = false;
                    btnSubmitLogin.innerHTML = originalBtnHTML;
                    return;
                }
            } else {
                // --- FLUJO DE CREAR CUENTA ---
                if (!querySnapshot.empty) {
                    Swal.fire({
                        title: 'Usuario Ya Registrado',
                        text: 'Este correo institucional ya tiene una cuenta registrada. Selecciona "Iniciar Sesión" para acceder.',
                        icon: 'warning',
                        confirmButtonColor: '#3b82f6',
                        background: 'rgba(15, 23, 42, 0.9)'
                    });
                    btnSubmitLogin.disabled = false;
                    btnSubmitLogin.innerHTML = originalBtnHTML;
                    return;
                }

                // Guardamos el documento con el nombre
                finalName = name;
                await db.collection("credenciales_custom").add({
                    correo: email,
                    contrasena: hashedPassword,
                    nombre: finalName,
                    fechaRegistro: new Date()
                });
            }

            // Limpiar formulario
            inputCustomEmail.value = '';
            inputCustomPassword.value = '';
            if (inputCustomConfirmPassword) inputCustomConfirmPassword.value = '';
            if (inputCustomName) inputCustomName.value = '';

            // Guardar en localStorage para persistencia
            localStorage.setItem('custom-user-email', email);
            localStorage.setItem('custom-user-name', finalName);

            // Actualizar el texto del botón del Home con el nombre o los primeros 8 caracteres
            const loginSpan = document.querySelector('#btn-home-login span');
            if (loginSpan) {
                loginSpan.textContent = finalName ? finalName.substring(0, 8) : email.substring(0, 8);
            }

            Swal.fire({
                title: currentLoginMode === 'login' ? '¡Sesión Iniciada!' : '¡Cuenta Creada!',
                text: currentLoginMode === 'login' ? 'Has iniciado sesión con éxito.' : 'Tu cuenta institucional ha sido registrada con éxito.',
                icon: 'success',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            }).then(() => {
                navigateTo('page-home');
            });

        } catch (error) {
            console.error("Error al registrar/iniciar sesión:", error);
            Swal.fire('Error', 'No se pudo procesar la información: ' + error.message, 'error');
        } finally {
            btnSubmitLogin.disabled = false;
            setLoginMode(currentLoginMode);
        }
    });
}

// Escuchar en tiempo real e inyectar el listado de credenciales
if (credentialsContainer) {
    db.collection("credenciales_custom")
      .orderBy("correo", "asc")
      .onSnapshot(snapshot => {
          credentialsContainer.innerHTML = "";

          if (snapshot.empty) {
              credentialsContainer.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.3); padding: 3rem; font-size: 0.95rem;">No hay credenciales registradas aún.</p>`;
              return;
          }

          snapshot.forEach(doc => {
              const data = doc.data();
              const card = document.createElement('div');
              card.className = "report-card";

              // Detectar si la contraseña es un hash
              const isHashed = /^[0-9a-fA-F]{64}$/.test(data.contrasena);
              let displayPass;
              let btnShowHtml;

              if (isHashed) {
                  displayPass = "*".repeat(8) + " (Hashed/Segura)";
                  btnShowHtml = `<button class="show-pass-btn" data-pass="${data.contrasena}" data-hashed="true" style="background: transparent; border: none; color: var(--accent-color); cursor: pointer; font-size: 0.85rem; font-family: inherit; text-decoration: underline; padding: 0;">Mostrar Hash</button>`;
              } else {
                  displayPass = "*".repeat(data.contrasena.length);
                  btnShowHtml = `<button class="show-pass-btn" data-pass="${data.contrasena}" data-hashed="false" style="background: transparent; border: none; color: var(--accent-color); cursor: pointer; font-size: 0.85rem; font-family: inherit; text-decoration: underline; padding: 0;">Mostrar Contraseña</button>`;
              }

              const displayNameText = data.nombre ? `${data.nombre} (${data.correo})` : data.correo;

              card.innerHTML = `
                  <div class="report-indicator" style="background-color: var(--accent-color);"></div>
                  <div class="report-header">
                      <span class="report-category">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                          ${displayNameText}
                      </span>
                      <span class="report-date">
                          ${data.fechaRegistro ? new Date(data.fechaRegistro.seconds * 1000).toLocaleDateString('es-ES') : 'Reciente'}
                      </span>
                  </div>
                  <div class="report-text" style="margin-top: 5px;">
                      <strong>Contraseña:</strong> <span style="font-family: monospace; letter-spacing: 2px;">${displayPass}</span> 
                  </div>
                  <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                      ${btnShowHtml}
                      <button class="show-messages-btn" data-email="${data.correo}" style="background: transparent; border: none; color: var(--accent-color); cursor: pointer; font-size: 0.85rem; font-family: inherit; text-decoration: underline; padding: 0;">Ver Mensajes</button>
                      <button class="delete-cred-btn" data-id="${doc.id}" data-email="${data.correo}" style="background: transparent; border: none; color: var(--danger); cursor: pointer; font-size: 0.85rem; font-family: inherit; text-decoration: underline; padding: 0;">Borrar Datos</button>
                  </div>
              `;
              credentialsContainer.appendChild(card);
          });

          // Agregar eventos de mostrar/ocultar contraseña o hash
          document.querySelectorAll('.show-pass-btn').forEach(btn => {
              btn.addEventListener('click', (e) => {
                  const pass = e.target.getAttribute('data-pass');
                  const isHashed = e.target.getAttribute('data-hashed') === 'true';
                  const passSpan = e.target.closest('.report-card').querySelector('.report-text span');
                  
                  if (isHashed) {
                      if (e.target.textContent === "Mostrar Hash") {
                          passSpan.textContent = pass;
                          passSpan.style.letterSpacing = "normal";
                          passSpan.style.wordBreak = "break-all";
                          e.target.textContent = "Ocultar Hash";
                      } else {
                          passSpan.textContent = "*".repeat(8) + " (Hashed/Segura)";
                          passSpan.style.letterSpacing = "2px";
                          passSpan.style.wordBreak = "normal";
                          e.target.textContent = "Mostrar Hash";
                      }
                  } else {
                      if (e.target.textContent === "Mostrar Contraseña") {
                          passSpan.textContent = pass;
                          passSpan.style.letterSpacing = "normal";
                          e.target.textContent = "Ocultar Contraseña";
                      } else {
                          passSpan.textContent = "*".repeat(pass.length);
                          passSpan.style.letterSpacing = "2px";
                          e.target.textContent = "Mostrar Contraseña";
                      }
                  }
              });
          });

          // Agregar eventos de mostrar mensajes del usuario
          document.querySelectorAll('.show-messages-btn').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                  const email = e.target.getAttribute('data-email');
                  
                  Swal.fire({
                      title: 'Cargando mensajes...',
                      text: 'Buscando reportes del usuario',
                      allowOutsideClick: false,
                      didOpen: () => { Swal.showLoading(); }
                  });

                  try {
                      const reportsSnapshot = await db.collection("reportes")
                                                       .where("autor", "==", email)
                                                       .get();

                      if (reportsSnapshot.empty) {
                          Swal.fire({
                              title: `Reportes de ${email}`,
                              text: 'Este usuario no ha publicado ningún reporte en el sistema.',
                              icon: 'info',
                              confirmButtonColor: '#3b82f6',
                              background: 'rgba(15, 23, 42, 0.9)'
                          });
                          return;
                      }

                      // Convertir y ordenar por fecha en JS
                      const docs = [];
                      reportsSnapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
                      docs.sort((a, b) => {
                          const tA = a.fecha ? a.fecha.seconds : 0;
                          const tB = b.fecha ? b.fecha.seconds : 0;
                          return tB - tA;
                      });

                      let messagesHTML = '<div style="max-height: 300px; overflow-y: auto; text-align: left; display: flex; flex-direction: column; gap: 10px; padding: 10px;">';
                      docs.forEach(rData => {
                          const rDate = rData.fecha ? new Date(rData.fecha.seconds * 1000).toLocaleString('es-ES') : 'Reciente';
                          messagesHTML += `
                              <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border-left: 3px solid var(--accent-color);">
                                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-bottom: 4px;">📅 ${rDate} - 🏷️ ${rData.categoria}</div>
                                  <div style="color: #ffffff; font-size: 0.95rem; line-height: 1.4;">${rData.texto}</div>
                              </div>
                          `;
                      });
                      messagesHTML += '</div>';

                      Swal.fire({
                          title: `Reportes de ${email}`,
                          html: messagesHTML,
                          confirmButtonColor: '#3b82f6',
                          confirmButtonText: 'Cerrar',
                          background: 'rgba(15, 23, 42, 0.9)',
                          width: '500px'
                      });

                  } catch (error) {
                      console.error("Error al buscar reportes del usuario:", error);
                      Swal.fire('Error', 'No se pudieron recuperar los reportes: ' + error.message, 'error');
                  }
              });
          });

          // Agregar eventos de borrar credenciales
          document.querySelectorAll('.delete-cred-btn').forEach(btn => {
              btn.addEventListener('click', (e) => {
                  const docId = e.target.getAttribute('data-id');
                  const email = e.target.getAttribute('data-email');
                  
                  Swal.fire({
                      title: '¿Eliminar Credenciales?',
                      text: `¿Estás seguro de que deseas eliminar las credenciales de ${email}?`,
                      icon: 'warning',
                      showCancelButton: true,
                      confirmButtonColor: '#ef4444',
                      cancelButtonColor: '#3b82f6',
                      confirmButtonText: 'Sí, eliminar',
                      cancelButtonText: 'Cancelar',
                      background: 'rgba(15, 23, 42, 0.9)'
                  }).then(async (result) => {
                      if (result.isConfirmed) {
                          try {
                              await db.collection("credenciales_custom").doc(docId).delete();
                              Swal.fire({
                                  title: 'Eliminado',
                                  text: 'Las credenciales han sido eliminadas correctamente.',
                                  icon: 'success',
                                  confirmButtonColor: '#3b82f6',
                                  background: 'rgba(15, 23, 42, 0.9)'
                              });
                          } catch (error) {
                              console.error("Error al borrar credenciales:", error);
                              Swal.fire('Error', 'No se pudo eliminar: ' + error.message, 'error');
                          }
                      }
                  });
              });
          });

      }, error => {
          console.error("Error al escuchar credenciales:", error);
      });
}

// --- LÓGICA DE LA PÁGINA DE PERFIL (PÁGINA 6) ---
const profileEmailInput = document.getElementById('profile-email');
const profileNameInput = document.getElementById('profile-name');
const btnEditProfile = document.getElementById('btn-edit-profile');
const btnEditProfileText = document.getElementById('btn-edit-profile-text');
const profileDisplayName = document.getElementById('profile-display-name');
const profileAvatar = document.getElementById('profile-avatar');
const myReportsContainer = document.getElementById('my-reports-container');
const btnProfileLogout = document.getElementById('btn-profile-logout');

function loadUserProfile() {
    const userEmail = localStorage.getItem('custom-user-email');
    const userName = localStorage.getItem('custom-user-name') || '';

    if (!userEmail) {
        navigateTo('page-home');
        return;
    }

    // Cargar datos en los inputs
    if (profileEmailInput) profileEmailInput.value = userEmail;
    if (profileNameInput) {
        profileNameInput.value = userName;
        profileNameInput.readOnly = true;
        profileNameInput.style.border = "1px solid var(--panel-border)";
    }
    
    if (profileDisplayName) profileDisplayName.textContent = userName || userEmail;
    if (profileAvatar) {
        profileAvatar.textContent = (userName || userEmail).charAt(0).toUpperCase();
    }

    // Resetear el botón de edición
    if (btnEditProfileText) btnEditProfileText.textContent = "Editar Perfil";

    // Cargar reportes de este usuario en tiempo real
    if (myReportsContainer) {
        myReportsContainer.innerHTML = '<p style="color: rgba(255,255,255,0.3); text-align: center; padding: 2rem;">Cargando tus reportes...</p>';
        
        myReportsUnsubscribe = db.collection("reportes")
                                 .where("autor", "==", userEmail)
                                 .onSnapshot(snapshot => {
                                     myReportsContainer.innerHTML = "";
                                     
                                     if (snapshot.empty) {
                                         myReportsContainer.innerHTML = `<p style="color: rgba(255,255,255,0.3); text-align: center; padding: 2rem; font-size: 0.9rem; grid-column: 1/-1;">No has realizado ningún reporte aún.</p>`;
                                         return;
                                     }
                                     
                                     // Extraer y ordenar por fecha en JS para evitar índice compuesto obligatorio en Firestore
                                     const reportsList = [];
                                     snapshot.forEach(doc => {
                                         reportsList.push({ id: doc.id, ...doc.data() });
                                     });
                                     
                                     reportsList.sort((a, b) => {
                                         const tA = a.fecha ? (a.fecha.seconds || 0) : 0;
                                         const tB = b.fecha ? (b.fecha.seconds || 0) : 0;
                                         return tB - tA;
                                     });
                                     
                                     reportsList.forEach(rData => {
                                         const card = document.createElement('div');
                                         card.className = "report-card";
                                         card.style.borderLeft = "4px solid " + getColor(rData.categoria);
                                         card.style.padding = "1rem";
                                         
                                         const dateStr = (rData.fecha && typeof rData.fecha.toDate === 'function') 
                                             ? rData.fecha.toDate().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) 
                                             : 'Reciente';
                                         
                                         card.innerHTML = `
                                             <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                                 <strong style="color: white; font-size: 0.95rem;">${rData.categoria}</strong>
                                                 <small style="color: rgba(255,255,255,0.4); font-size: 0.75rem;">${dateStr}</small>
                                             </div>
                                             <p style="color: #cbd5e1; font-size: 0.85rem; margin: 0 0 0.75rem 0; line-height: 1.4;">${rData.texto}</p>
                                             <div style="display: flex; gap: 0.75rem; font-size: 0.75rem; color: var(--text-secondary);">
                                                 <span>❤️ ${rData.likes || 0} Likes</span>
                                                 <span>Confirmaciones (${rData.confirmations || 0})</span>
                                             </div>
                                         `;
                                         myReportsContainer.appendChild(card);
                                     });
                                 }, error => {
                                     console.error("Error al escuchar reportes propios:", error);
                                     myReportsContainer.innerHTML = `<p style="color: var(--danger); text-align: center; padding: 2rem;">Error al cargar reportes.</p>`;
                                 });
    }
}

// Redirigir el botón Editar Perfil a la Página 7
if (btnEditProfile) {
    btnEditProfile.addEventListener('click', () => {
        navigateTo('page-edit-profile');
    });
}

// --- LÓGICA DE LA PÁGINA DE EDICIÓN DE PERFIL (PÁGINA 7) ---
function loadEditProfileFields() {
    const currentName = localStorage.getItem('custom-user-name') || '';
    const editCustomName = document.getElementById('edit-custom-name');
    const editCustomPassword = document.getElementById('edit-custom-password');
    const editCustomConfirmPassword = document.getElementById('edit-custom-confirm-password');

    if (editCustomName) {
        editCustomName.value = currentName;
    }
    if (editCustomPassword) {
        editCustomPassword.value = '';
    }
    if (editCustomConfirmPassword) {
        editCustomConfirmPassword.value = '';
    }
}

// Guardar Nombre Modificado
const btnSaveName = document.getElementById('btn-save-name');
if (btnSaveName) {
    btnSaveName.addEventListener('click', async () => {
        const userEmail = localStorage.getItem('custom-user-email');
        if (!userEmail) return;

        const editCustomName = document.getElementById('edit-custom-name');
        const newName = editCustomName ? editCustomName.value.trim() : '';

        if (!newName) {
            Swal.fire({
                title: 'Nombre Vacío',
                text: 'Por favor, ingresa tu nombre completo.',
                icon: 'warning',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        btnSaveName.disabled = true;
        const originalText = btnSaveName.textContent;
        btnSaveName.textContent = "Guardando...";

        try {
            // Actualizar en Firestore en la colección credenciales_custom
            const querySnapshot = await db.collection("credenciales_custom")
                                           .where("correo", "==", userEmail)
                                           .get();

            if (!querySnapshot.empty) {
                const docId = querySnapshot.docs[0].id;
                await db.collection("credenciales_custom").doc(docId).update({
                    nombre: newName
                });

                // Actualizar localStorage
                localStorage.setItem('custom-user-name', newName);

                // Actualizar UI del perfil
                const profileDisplayName = document.getElementById('profile-display-name');
                const profileAvatar = document.getElementById('profile-avatar');
                const profileNameInput = document.getElementById('profile-name');
                if (profileDisplayName) profileDisplayName.textContent = newName;
                if (profileAvatar) profileAvatar.textContent = newName.charAt(0).toUpperCase();
                if (profileNameInput) profileNameInput.value = newName;

                // Actualizar el texto del botón del Home
                const loginSpan = document.querySelector('#btn-home-login span');
                if (loginSpan) {
                    loginSpan.textContent = newName.substring(0, 8);
                }

                Swal.fire({
                    title: 'Perfil Actualizado',
                    text: 'Tu nombre completo se ha guardado con éxito.',
                    icon: 'success',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    background: 'rgba(15, 23, 42, 0.95)'
                });

                // Volver a la página de perfil
                navigateTo('page-profile');
            } else {
                Swal.fire('Error', 'No se encontró tu registro de usuario.', 'error');
            }
        } catch (error) {
            console.error("Error al actualizar nombre de perfil:", error);
            Swal.fire('Error', 'Hubo un error al guardar el nombre: ' + error.message, 'error');
        } finally {
            btnSaveName.disabled = false;
            btnSaveName.textContent = originalText;
        }
    });
}

// Guardar Contraseña Modificada (con hash SHA-256)
const btnSavePassword = document.getElementById('btn-save-password');
if (btnSavePassword) {
    btnSavePassword.addEventListener('click', async () => {
        const userEmail = localStorage.getItem('custom-user-email');
        if (!userEmail) return;

        const editCustomPassword = document.getElementById('edit-custom-password');
        const editCustomConfirmPassword = document.getElementById('edit-custom-confirm-password');

        const newPassword = editCustomPassword ? editCustomPassword.value : '';
        const confirmPassword = editCustomConfirmPassword ? editCustomConfirmPassword.value : '';

        if (!newPassword) {
            Swal.fire({
                title: 'Contraseña Vacía',
                text: 'Por favor, ingresa tu nueva contraseña.',
                icon: 'warning',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        if (newPassword !== confirmPassword) {
            Swal.fire({
                title: 'Contraseñas no coinciden',
                text: 'La nueva contraseña y la confirmación no son iguales. Por favor, verifica.',
                icon: 'error',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
            return;
        }

        btnSavePassword.disabled = true;
        const originalText = btnSavePassword.textContent;
        btnSavePassword.textContent = "Guardando...";

        try {
            // Hashing de la nueva contraseña
            const hashedPassword = await hashPassword(newPassword);

            // Actualizar en Firestore en la colección credenciales_custom
            const querySnapshot = await db.collection("credenciales_custom")
                                           .where("correo", "==", userEmail)
                                           .get();

            if (!querySnapshot.empty) {
                const docId = querySnapshot.docs[0].id;
                await db.collection("credenciales_custom").doc(docId).update({
                    contrasena: hashedPassword
                });

                Swal.fire({
                    title: 'Contraseña Actualizada',
                    text: 'Tu contraseña se ha cambiado con éxito. Deberás iniciar sesión con tu nueva contraseña la próxima vez.',
                    icon: 'success',
                    confirmButtonColor: '#3b82f6',
                    background: 'rgba(15, 23, 42, 0.9)'
                });

                // Volver a la página de perfil
                navigateTo('page-profile');
            } else {
                Swal.fire('Error', 'No se encontró tu registro de usuario.', 'error');
            }
        } catch (error) {
            console.error("Error al actualizar contraseña:", error);
            Swal.fire('Error', 'Hubo un error al cambiar la contraseña: ' + error.message, 'error');
        } finally {
            btnSavePassword.disabled = false;
            btnSavePassword.textContent = originalText;
        }
    });
}

// --- LÓGICA DE CIERRE DE SESIÓN (UNIFICADA) ---
function handleLogout() {
    // Eliminar del localStorage
    localStorage.removeItem('custom-user-email');
    localStorage.removeItem('custom-user-name');

    // Restaurar el botón del Home
    const loginSpan = document.querySelector('#btn-home-login span');
    if (loginSpan) {
        loginSpan.textContent = 'Iniciar Sesión';
    }

    // Ocultar botón de logout custom de la Página 4
    const btnCustomLogout = document.getElementById('btn-custom-logout');
    if (btnCustomLogout) {
        btnCustomLogout.style.display = 'none';
    }

    // Detener escuchadores del perfil
    if (myReportsUnsubscribe) {
        myReportsUnsubscribe();
        myReportsUnsubscribe = null;
    }

    Swal.fire({
        title: 'Sesión Cerrada',
        text: 'Has cerrado sesión correctamente.',
        icon: 'success',
        confirmButtonColor: '#3b82f6',
        background: 'rgba(15, 23, 42, 0.9)'
    }).then(() => {
        navigateTo('page-home');
    });
}

// Asignar eventos de cerrar sesión a ambos botones (Home y Perfil)
const btnCustomLogout = document.getElementById('btn-custom-logout');
if (btnCustomLogout) {
    btnCustomLogout.addEventListener('click', handleLogout);
}
if (btnProfileLogout) {
    btnProfileLogout.addEventListener('click', handleLogout);
}

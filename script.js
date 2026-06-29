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
let currentStaffCategory = null;

// --- LÓGICA DE AUTENTICACIÓN ---
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const loginSection = document.getElementById('login-section');
const userInfoSection = document.getElementById('user-info-section');
const uploadContainer = document.getElementById('upload-container');
const userEmailText = document.getElementById('user-email');

// --- ELEMENTOS DE VISTA PREVIA DE IMAGEN ---
const fileInput = document.getElementById('photo-upload');
const cameraInput = document.getElementById('camera-upload');
const uploadBtnText = document.getElementById('upload-btn-text');
const previewContainer = document.getElementById('image-preview-container');
const previewImage = document.getElementById('image-preview');
const btnRemovePhoto = document.getElementById('btn-remove-photo');
let currentSelectedFile = null;

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
        if (user.email.endsWith('@usm.cl') || user.email.endsWith('@sansano.usm.cl') || user.email.endsWith('@sansano.cl')) {
            currentUserEmail = user.email;
            userEmailText.textContent = `Conectado como: ${user.email}`;
            loginSection.style.display = 'none';
            userInfoSection.style.display = 'flex';
            uploadContainer.style.display = 'flex';
            // Invalidar el tamaño del mapa para que se dibuje correctamente al mostrarse
            setTimeout(() => { formMap.invalidateSize(); }, 300);
        } else {
            auth.signOut();
            Swal.fire('Acceso Denegado', 'Debes usar un correo institucional de la USM (@usm.cl, @sansano.usm.cl o @sansano.cl).', 'error');
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
currentUserEmail = "usuario no registrado";

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

// --- SECTORES DEL CAMPUS SAN JOAQUÍN ---
const sectorEdificiosE = [
    [-33.48940, -70.62060],
    [-33.48940, -70.62035],
    [-33.49040, -70.62035],
    [-33.49040, -70.62060]
];

const sectorEdificioB = [
    [-33.48940, -70.62035],
    [-33.48940, -70.61910],
    [-33.49010, -70.61910],
    [-33.49010, -70.62035]
];

const sectorEdificioF = [
    [-33.48940, -70.61910],
    [-33.48940, -70.61800],
    [-33.49040, -70.61800],
    [-33.49040, -70.61910]
];

const sectorCanchas = [
    [-33.49010, -70.62020],
    [-33.49010, -70.61910],
    [-33.49130, -70.61910],
    [-33.49130, -70.62020]
];

const sectorEdificioC = [
    [-33.49040, -70.61910],
    [-33.49040, -70.61870],
    [-33.49110, -70.61870],
    [-33.49110, -70.61910]
];

const sectorEdificioA = [
    [-33.48990, -70.61870],
    [-33.48990, -70.61800],
    [-33.49150, -70.61800],
    [-33.49150, -70.61870]
];

const sectorEdificioK = [
    [-33.49130, -70.62020],
    [-33.49130, -70.61830],
    [-33.49180, -70.61830],
    [-33.49180, -70.62020]
];

let sectores = [
    { name: "Edificios E (E1, E2, E3)", polygon: sectorEdificiosE, color: "#6b7280" },
    { name: "Edificio B", polygon: sectorEdificioB, color: "#f59e0b" },
    { name: "Edificio F", polygon: sectorEdificioF, color: "#10b981" },
    { name: "Canchas de Fútbol", polygon: sectorCanchas, color: "#22c55e" },
    { name: "Edificio C", polygon: sectorEdificioC, color: "#8b5cf6" },
    { name: "Edificio A", polygon: sectorEdificioA, color: "#3b82f6" },
    { name: "Futuro Edificio K", polygon: sectorEdificioK, color: "#ec4899" }
];

let editorMap;
let editorPolygon = null;
let editorMarkers = [];
let tempSectores = [];
let editorBackgroundPolygons = [];

// Capas de polígono del campus para actualización dinámica
let formCampusPolygon = null;
let globalCampusPolygon = null;
let editorCampusPolygon = null;

function getSectorFromCoords(lat, lng) {
    for (const sec of sectores) {
        if (isPointInPolygon(lat, lng, sec.polygon)) {
            return sec.name;
        }
    }
    return "Patios y Áreas Verdes";
}

function updateDetectedSector() {
    const sector = getSectorFromCoords(currentLat, currentLng);
    const badge = document.getElementById('detected-sector-badge');
    if (badge) {
        badge.textContent = sector;
        const secObj = sectores.find(s => s.name === sector);
        if (secObj) {
            badge.style.backgroundColor = secObj.color + '26';
            badge.style.color = secObj.color;
            badge.style.borderColor = secObj.color + '4d';
        } else {
            badge.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
            badge.style.color = '#818cf8';
            badge.style.borderColor = 'rgba(99, 102, 241, 0.3)';
        }
    }
}

// Cargar sectores personalizados de Firestore al iniciar el script si existen
try {
    db.collection("config").doc("map_sectors").get().then(doc => {
        if (doc.exists && doc.data().sectores) {
            // Firestore no soporta arreglos anidados, por lo que las coordenadas vienen como {lat, lng}
            // Las convertimos de vuelta a [lat, lng] para mantener la compatibilidad con el resto del código
            sectores = doc.data().sectores.map(sec => ({
                name: sec.name,
                color: sec.color,
                polygon: sec.polygon.map(p => Array.isArray(p) ? p : [p.lat, p.lng])
            }));
            updateDetectedSector();
        }
    });
} catch (e) {
    console.warn("Error al precargar sectores desde Firestore:", e);
}

// 1. Mapa del Formulario
const formMap = L.map('form-map', mapOptions).setView(usmSanJoaquin, 17);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap'
}).addTo(formMap);

// Polígono del campus en el mapa del formulario
formCampusPolygon = L.polygon(campusCoordinates, {
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.04,
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
        updateDetectedSector();
    } else {
        // Devolver el marcador al centro si se arrastra fuera
        formMarker.setLatLng(usmSanJoaquin);
        currentLat = usmSanJoaquin[0];
        currentLng = usmSanJoaquin[1];
        updateDetectedSector();
        Swal.fire('Ubicación Inválida', 'Por favor, arrastra el marcador dentro del área del campus delimitada en azul.', 'warning');
    }
});

formMap.on('click', function(e) {
    // Validar que el clic esté dentro del polígono del campus (zona azul)
    if (isPointInPolygon(e.latlng.lat, e.latlng.lng, campusCoordinates)) {
        formMarker.setLatLng(e.latlng);
        currentLat = e.latlng.lat;
        currentLng = e.latlng.lng;
        updateDetectedSector();
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
                    updateDetectedSector();
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
globalCampusPolygon = L.polygon(campusCoordinates, {
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.04,
    weight: 2,
    dashArray: '5, 8'
}).addTo(globalMap);

// Inicializar el sector por primera vez en el badge
updateDetectedSector();

let globalMarkers = []; // Array para guardar los pines actuales

// --- NAVEGACIÓN ENTRE PÁGINAS (SPA) ---
const pageWelcome = document.getElementById('page-welcome');
const pageHome = document.getElementById('page-home');
const pageReportForm = document.getElementById('page-report-form');
const pageReportsList = document.getElementById('page-reports-list');
const pageLoginCustom = document.getElementById('page-login-custom');
const pageCredentialsList = document.getElementById('page-credentials-list');
const pageProfile = document.getElementById('page-profile');
const pageEditProfile = document.getElementById('page-edit-profile');
const pageAiRules = document.getElementById('page-ai-rules');
const pageEditMapSectors = document.getElementById('page-edit-map-sectors');

const btnGotoReport = document.getElementById('btn-goto-report');
const btnGotoList = document.getElementById('btn-goto-list');
const btnHomeLogin = document.getElementById('btn-home-login');
const btnGotoCredentials = document.getElementById('btn-goto-credentials');
const btnBackCredentials = document.getElementById('btn-back-credentials');
const btnBackProfile = document.getElementById('btn-back-profile');
const btnBackEditProfile = document.getElementById('btn-back-edit-profile');
const btnBackLogin = document.getElementById('btn-back-login');
const backBtns = document.querySelectorAll('.back-btn');

let myReportsUnsubscribe = null; // Guardar la desuscripción de reportes del perfil

// The rest of navigateTo function remains unchanged
function navigateTo(pageId) {
    // Desuscribirse de reportes del perfil si salimos de él
    if (pageId !== 'page-profile' && pageId !== 'page-edit-profile' && myReportsUnsubscribe) {
        myReportsUnsubscribe();
        myReportsUnsubscribe = null;
    }

    if ((pageId === 'page-home' || pageId === 'page-welcome') && currentStaffCategory) {
        currentStaffCategory = null;
        activeCategoryFilter = "all";
        document.querySelectorAll('.filter-btn[data-filter-type="category"]').forEach(b => {
            b.style.display = 'inline-block';
            if(b.getAttribute('data-filter-val') === "all") {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
        Swal.fire({
            title: 'Sesión Finalizada',
            text: 'Has salido del modo encargado.',
            icon: 'info',
            timer: 1500,
            showConfirmButton: false,
            background: 'rgba(15, 23, 42, 0.9)'
        });
    }

    // Staff login from welcome handled separately (no changes needed here)
    // Reset staff state when returning to welcome page handled in initBackButtons via navigation

    // Existing navigation logic (show/hide pages) continues as before
    // Hide all pages
    [pageWelcome, pageHome, pageReportForm, pageReportsList, pageLoginCustom, pageCredentialsList, pageProfile, pageEditProfile, pageAiRules, pageEditMapSectors].forEach(page => {
        if (page) {
            page.style.display = 'none';
            page.classList.remove('active');
        }
    });
    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.style.display = 'flex';
        targetPage.classList.add('active');
        // Additional per-page logic (e.g., map invalidation) remains unchanged
        if (pageId === 'page-reports-list' && typeof globalMap !== 'undefined') {
            setTimeout(() => globalMap.invalidateSize(), 100);
            // Set default filter to 'today' for regular users (non-staff)
            if (!currentStaffCategory) {
                activeSpecialFilter = 'today';
                document.querySelectorAll('.filter-btn[data-filter-type="special"]').forEach(b => {
                    if (b.getAttribute('data-filter-val') === 'today') {
                        b.classList.add('active');
                    } else {
                        b.classList.remove('active');
                    }
                });
                renderFilteredReports();
            }
        } else if (pageId === 'page-report-form' && typeof formMap !== 'undefined') {
            setTimeout(() => formMap.invalidateSize(), 100);
        } else if (pageId === 'page-edit-map-sectors') {
            setTimeout(() => {
                if (typeof editorMap !== 'undefined') {
                    editorMap.invalidateSize();
                } else {
                    setupEditorMap();
                }
                loadSectorsInEditorList();
            }, 100);
        } else if (pageId === 'page-ai-rules') {
            loadAiRules();
        } else if (pageId === 'page-home') {
            const userEmail = localStorage.getItem('custom-user-email');
            const btnGotoList = document.getElementById('btn-goto-list');
            if (btnGotoList) {
                if (userEmail) {
                    btnGotoList.style.display = 'flex';
                } else {
                    btnGotoList.style.display = 'none';
                }
            }
        }
    }
}

// Back button listeners are set up below (lines ~516-529) with correct per-page navigation.
// No need for a blanket initBackButtons override.

// Request Notification permission on first load
function requestNotificationPermission() {
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Swal({
                    title: 'Notificaciones Activadas',
                    text: '¡Gracias! Recibirás alertas de nuevos reportes y actualizaciones.',
                    icon: 'success',
                    confirmButtonColor: '#3b82f6',
                    background: 'rgba(15, 23, 42, 0.9)'
                });
            } else if (permission === "denied") {
                new Swal({
                    title: 'Notificaciones Desactivadas',
                    text: 'Puedes habilitarlas más tarde en la configuración del navegador.',
                    icon: 'info',
                    confirmButtonColor: '#3b82f6',
                    background: 'rgba(15, 23, 42, 0.9)'
                });
            }
        });
    }
}

// Call initialization functions after DOM loaded
document.addEventListener('DOMContentLoaded', () => {
    requestNotificationPermission();
    
    // Configurar botones de edición de sectores con contraseña 1234
    const btnEditSectors = document.getElementById('btn-edit-sectors');
    if (btnEditSectors) {
        btnEditSectors.addEventListener('click', promptForSectorEditing);
    }
    
    const btnEditSectorsGlobal = document.getElementById('btn-edit-sectors-global');
    if (btnEditSectorsGlobal) {
        btnEditSectorsGlobal.addEventListener('click', promptForSectorEditing);
    }

    const btnBackEditMapSectors = document.getElementById('btn-back-edit-map-sectors');
    if (btnBackEditMapSectors) {
        btnBackEditMapSectors.addEventListener('click', () => navigateTo('page-home'));
    }

    // Inicializar escuchas del formulario de edición de sectores
    const selectSector = document.getElementById('editor-sector-select');
    if (selectSector) {
        selectSector.addEventListener('change', (e) => {
            loadSectorInEditor(parseInt(e.target.value, 10));
        });
    }

    const nameInput = document.getElementById('editor-sector-name');
    if (nameInput) {
        nameInput.addEventListener('input', (e) => {
            const select = document.getElementById('editor-sector-select');
            if (!select) return;
            const index = parseInt(select.value, 10);
            if (index >= 0 && index < tempSectores.length) {
                tempSectores[index].name = e.target.value;
                select.options[index].text = e.target.value;
            }
        });
    }

    const colorInput = document.getElementById('editor-sector-color');
    const colorHexInput = document.getElementById('editor-sector-color-hex');

    if (colorInput && colorHexInput) {
        colorInput.addEventListener('input', (e) => {
            const val = e.target.value;
            colorHexInput.value = val;
            updateActiveSectorColor(val);
        });
        colorHexInput.addEventListener('input', (e) => {
            let val = e.target.value;
            if (val.startsWith('#') && val.length === 7) {
                colorInput.value = val;
                updateActiveSectorColor(val);
            }
        });
    }

    const btnAddVertex = document.getElementById('btn-editor-add-vertex');
    if (btnAddVertex) {
        btnAddVertex.addEventListener('click', () => {
            const select = document.getElementById('editor-sector-select');
            if (!select) return;
            const index = parseInt(select.value, 10);
            if (index >= 0 && index < tempSectores.length) {
                const center = editorMap.getCenter();
                tempSectores[index].polygon.push([center.lat, center.lng]);
                loadSectorInEditor(index);
            }
        });
    }

    const btnDeleteVertex = document.getElementById('btn-editor-delete-vertex');
    if (btnDeleteVertex) {
        btnDeleteVertex.addEventListener('click', () => {
            const select = document.getElementById('editor-sector-select');
            if (!select) return;
            const index = parseInt(select.value, 10);
            if (index >= 0 && index < tempSectores.length) {
                if (tempSectores[index].polygon.length > 3) {
                    tempSectores[index].polygon.pop();
                    loadSectorInEditor(index);
                } else {
                    Swal.fire('Atención', 'Un sector debe tener al menos 3 vértices para formar un polígono.', 'warning');
                }
            }
        });
    }

    const btnNewSector = document.getElementById('btn-editor-new-sector');
    if (btnNewSector) {
        btnNewSector.addEventListener('click', () => {
            const center = editorMap.getCenter();
            const name = "Nuevo Sector " + (tempSectores.length + 1);
            const offset = 0.0004;
            const newSec = {
                name: name,
                color: '#3b82f6',
                polygon: [
                    [center.lat + offset, center.lng],
                    [center.lat - offset, center.lng + offset],
                    [center.lat - offset, center.lng - offset]
                ]
            };
            tempSectores.push(newSec);
            refreshSectorSelect(tempSectores.length - 1);
        });
    }

    const btnDeleteSector = document.getElementById('btn-editor-delete-sector');
    if (btnDeleteSector) {
        btnDeleteSector.addEventListener('click', () => {
            const select = document.getElementById('editor-sector-select');
            if (!select) return;
            const index = parseInt(select.value, 10);
            if (index >= 0 && index < tempSectores.length) {
                Swal.fire({
                    title: '¿Eliminar Sector?',
                    text: `¿Estás seguro de que deseas eliminar el sector "${tempSectores[index].name}"?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: 'Sí, eliminar',
                    cancelButtonText: 'Cancelar',
                    background: 'rgba(15, 23, 42, 0.9)'
                }).then((result) => {
                    if (result.isConfirmed) {
                        tempSectores.splice(index, 1);
                        if (tempSectores.length === 0) {
                            tempSectores.push({
                                name: "Sector Temporal",
                                color: "#3b82f6",
                                polygon: [
                                    [usmSanJoaquin[0] + 0.0004, usmSanJoaquin[1]],
                                    [usmSanJoaquin[0] - 0.0004, usmSanJoaquin[1] + 0.0004],
                                    [usmSanJoaquin[0] - 0.0004, usmSanJoaquin[1] - 0.0004]
                                ]
                            });
                        }
                        refreshSectorSelect(0);
                    }
                });
            }
        });
    }

    const btnSaveAll = document.getElementById('btn-editor-save-all');
    if (btnSaveAll) {
        btnSaveAll.addEventListener('click', () => {
            Swal.fire({
                title: 'Guardando sectores...',
                text: 'Sincronizando con Firestore',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            // Firestore no permite "nested arrays" (arreglos dentro de arreglos).
            // Transformamos el polygon [[lat, lng], ...] a un arreglo de objetos [{lat, lng}, ...]
            const cleanSectores = tempSectores.map(sec => ({
                name: sec.name,
                color: sec.color,
                polygon: sec.polygon.map(coord => ({ lat: coord[0], lng: coord[1] }))
            }));

            db.collection("config").doc("map_sectors").set({
                sectores: cleanSectores
            }).then(() => {
                // Al volver a la memoria local, restauramos al formato de arreglo [lat, lng]
                sectores = cleanSectores.map(sec => ({
                    name: sec.name,
                    color: sec.color,
                    polygon: sec.polygon.map(p => [p.lat, p.lng])
                }));
                updateDetectedSector();
                Swal.close(); // Cerrar el modal de carga antes de mostrar el éxito
                Swal.fire('Guardado', 'Los sectores del mapa se han actualizado correctamente. Recargando la aplicación...', 'success').then(() => {
                    location.reload(); // Recargar la página para asegurar refresco de todos los componentes y mapas
                });
            }).catch(err => {
                Swal.close(); // Cerrar el modal de carga antes de mostrar el error
                console.error("Error al guardar sectores en Firestore:", err);
                Swal.fire('Error al Guardar', 'No se pudo guardar: ' + err.message + '\n\nVerifica que las reglas de seguridad de Firestore permitan escritura en la colección "config".', 'error');
            });
        });
    }
});

// --- Welcome Staff Button ---
const btnWelcomeStaff = document.getElementById('btn-welcome-staff');
if (btnWelcomeStaff) {
    btnWelcomeStaff.addEventListener('click', () => {
        Swal.fire({
            title: 'Acceso Personal',
            text: 'Ingrese su contraseña de acceso:',
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
                let section = null;
                if (result.value === '6767') section = 'Seguridad';
                else if (result.value === '6969') section = 'Salud';
                else if (result.value === '1313') section = 'Equidad de Género';
                else if (result.value === '1234') section = 'AI-Moderation';

                if (section) {
                    currentStaffCategory = section;
                    if (section === 'AI-Moderation') {
                        Swal.fire({
                            title: 'Acceso Concedido',
                            text: 'Panel de Administrador de Reglas de IA',
                            icon: 'success',
                            confirmButtonColor: '#3b82f6',
                            background: 'rgba(15, 23, 42, 0.9)'
                        }).then(() => {
                            navigateTo('page-ai-rules');
                        });
                    } else {
                        Swal.fire({
                            title: 'Acceso Concedido',
                            text: 'Has ingresado como Encargado de ' + section,
                            icon: 'success',
                            confirmButtonColor: '#3b82f6',
                            background: 'rgba(15, 23, 42, 0.9)'
                        }).then(() => {
                            navigateTo('page-reports-list');
                        // Show ALL category buttons but pre-select staff's department
                        document.querySelectorAll('.filter-btn[data-filter-type="category"]').forEach(b => {
                            b.style.display = 'inline-block';
                            if (b.getAttribute('data-filter-val') === section) {
                                b.classList.add('active');
                            } else {
                                b.classList.remove('active');
                            }
                        });
                        // Reset special filter for staff view
                        activeSpecialFilter = 'all';
                        document.querySelectorAll('.filter-btn[data-filter-type="special"]').forEach(b => b.classList.remove('active'));
                        activeCategoryFilter = section;
                        renderFilteredReports();
                    });
                }
            } else {
                Swal.fire({
                        title: 'Acceso Denegado',
                        text: 'Contraseña incorrecta.',
                        icon: 'error',
                        confirmButtonColor: '#3b82f6',
                        background: 'rgba(15, 23, 42, 0.9)'
                    });
                }
            }
        });
    });
}


if (btnGotoReport) {
    btnGotoReport.addEventListener('click', () => navigateTo('page-report-form'));
}
if (btnGotoList) {
    btnGotoList.addEventListener('click', () => navigateTo('page-reports-list'));
}
if (btnHomeLogin) {
    btnHomeLogin.addEventListener('click', () => {
        // If user is logged in, go to profile; otherwise go to welcome for login options
        if (localStorage.getItem('custom-user-email')) {
            navigateTo('page-profile');
        } else {
            navigateTo('page-welcome');
        }
    });
}

const btnWelcomeLogin = document.getElementById('btn-welcome-login');
const btnWelcomeRegister = document.getElementById('btn-welcome-register');
const btnWelcomeGuest = document.getElementById('btn-welcome-guest');

if (btnWelcomeLogin) {
    btnWelcomeLogin.addEventListener('click', () => {
        navigateTo('page-login-custom');
        setLoginMode('login');
    });
}
if (btnWelcomeRegister) {
    btnWelcomeRegister.addEventListener('click', () => {
        navigateTo('page-login-custom');
        setLoginMode('register');
    });
}
if (btnWelcomeGuest) {
    btnWelcomeGuest.addEventListener('click', () => {
        // Clear any existing session so user enters as true guest
        localStorage.removeItem('custom-user-email');
        localStorage.removeItem('custom-user-name');
        const loginSpan = document.querySelector('#btn-home-login span');
        if (loginSpan) loginSpan.textContent = 'Iniciar Sesión';
        navigateTo('page-home');
    });
}

// btn-staff-login removed from page-home (login options are now on welcome page)
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
if (btnBackLogin) {
    btnBackLogin.addEventListener('click', () => navigateTo('page-welcome'));
}
backBtns.forEach(btn => {
    // Exclusiones: estos botones ya tienen su propio listener asignado arriba
    const excluded = [
        'btn-back-credentials',
        'btn-back-profile',
        'btn-back-edit-profile',
        'btn-back-login',
        'btn-back-ai-rules',          // Reglas IA → vuelve a page-welcome
        'btn-back-edit-map-sectors'   // Editor de mapa → ya tiene listener propio
    ];
    if (!excluded.includes(btn.id)) {
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

function parsePriority(priorityVal) {
    if (priorityVal === undefined || priorityVal === null) return 1;
    if (typeof priorityVal === 'number') {
        if (priorityVal >= 0 && priorityVal <= 5) return Math.round(priorityVal);
        return 1;
    }
    const str = String(priorityVal).toLowerCase().trim();
    const digitMatch = str.match(/[0-5]/);
    if (digitMatch) {
        return parseInt(digitMatch[0], 10);
    }
    if (str.includes('critica') || str.includes('crítica') || str.includes('critico') || str.includes('crítico') || str.includes('urgente') || str.includes('maxima') || str.includes('máxima')) {
        return 5;
    }
    if (str.includes('alta') || str.includes('alto')) {
        return 4;
    }
    if (str.includes('media') || str.includes('medio') || str.includes('moderado')) {
        return 3;
    }
    if (str.includes('baja') || str.includes('bajo')) {
        if (str.includes('muy')) return 1;
        return 2;
    }
    if (str.includes('eliminar') || str.includes('descartar') || str.includes('descartado') || str.includes('nula') || str.includes('nulo')) {
        return 0;
    }
    return 1;
}

async function analyzeReportWithAI(commentText) {
    try {
        // Cargar las reglas configuradas por el administrador en Firestore
        let rulesText = DEFAULT_AI_RULES;
        try {
            const rulesDoc = await db.collection("config").doc("ia_rules").get();
            if (rulesDoc.exists && rulesDoc.data().rules) {
                rulesText = rulesDoc.data().rules;
            }
        } catch (dbError) {
            console.warn("No se pudieron cargar las reglas de IA desde Firestore. Usando las por defecto.", dbError);
        }

        const prompt = `Eres el sistema de moderación automática de SafeUSM, una plataforma de reportes de incidentes en campus universitarios.

Analiza el siguiente reporte enviado por un usuario: "${commentText}".

Sigue ESTRICTAMENTE este flujo de decisiones y reglas definidas por el administrador:
${rulesText}

IMPORTANTE: Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido, sin markdown, sin bloques de código, sin texto adicional antes ni después. Usa exactamente este formato:
{ "priority": <número 1-5 o null si se elimina>, "accion": "aprobar" | "eliminar", "motivo": "" | "venta" | "inapropiado" }`;

        let textResult = "";
        
        // 1. Intentar usar Puter AI (Altamente confiable, estable y libre de keys)
        if (typeof puter !== 'undefined' && puter.ai) {
            try {
                console.log("Conectando con Puter AI...");
                const response = await puter.ai.chat(prompt, { model: 'openai/gpt-4o-mini' });
                textResult = response.toString();
                console.log("Respuesta recibida exitosamente desde Puter AI.");
            } catch (puterError) {
                console.warn("Fallo al conectar con Puter AI, intentando fallback de Pollinations...", puterError);
            }
        }
        
        // 2. Fallback: Usar Pollinations AI si Puter no está disponible o falla
        if (!textResult) {
            console.log("Conectando con Pollinations AI (Fallback)...");
            const models = ['openai', 'mistral', 'llama', 'gemini'];
            let success = false;
            
            for (const model of models) {
                try {
                    const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${model}&json=true`);
                    if (response.ok) {
                        textResult = await response.text();
                        if (textResult && textResult.trim().length > 0 && !textResult.includes("Queue full") && !textResult.includes("error")) {
                            success = true;
                            console.log(`Fallback exitoso usando Pollinations con modelo: ${model}`);
                            break;
                        }
                    }
                } catch (fetchErr) {
                    console.warn(`Error en fallback de Pollinations con modelo ${model}:`, fetchErr);
                }
            }
            
            if (!success) {
                throw new Error("No se pudo obtener una respuesta válida de ninguna de las APIs de IA gratuitas.");
            }
        }
        
        let priorityVal = 1;
        let accionVal = 'aprobar';
        let motivoVal = '';
        
        try {
            let cleanText = textResult.trim();
            // Limpiar marcadores de bloques de código de markdown si existieran
            cleanText = cleanText.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            const jsonMatch = cleanText.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                cleanText = jsonMatch[0];
            }
            
            const result = JSON.parse(cleanText);
            // Soporte para el formato nuevo ({ priority, accion, motivo }) y el legado ({ priority, isSale })
            accionVal = result.accion || (result.isSale ? 'eliminar' : 'aprobar');
            motivoVal = result.motivo || (result.isSale ? 'venta' : '');
            priorityVal = result.priority;
        } catch (parseError) {
            console.warn("Fallo al parsear JSON de la IA, aplicando fallback de regex.", parseError);
            const priorityMatch = textResult.match(/"priority"\s*:\s*(?:"([^"]+)"|(\d+)|null)/i);
            if (priorityMatch) priorityVal = priorityMatch[1] || priorityMatch[2] || null;
            const accionMatch = textResult.match(/"accion"\s*:\s*"(aprobar|eliminar)"/i);
            if (accionMatch) accionVal = accionMatch[1];
            const motivoMatch = textResult.match(/"motivo"\s*:\s*"([^"]*)"/i);
            if (motivoMatch) motivoVal = motivoMatch[1];
            // Compatibilidad con formato legado
            const isSaleMatch = textResult.match(/"isSale"\s*:\s*(true|false)/i);
            if (isSaleMatch && isSaleMatch[1] === 'true') { accionVal = 'eliminar'; motivoVal = 'venta'; }
        }
        
        return {
            priority: accionVal === 'eliminar' ? null : parsePriority(priorityVal),
            isSale: motivoVal === 'venta',
            isInappropriate: motivoVal === 'inapropiado',
            accion: accionVal,
            motivo: motivoVal
        };
    } catch (error) {
        console.error("Error crítico en análisis de IA:", error);
        return { priority: 1, isSale: false, isInappropriate: false, accion: 'aprobar', motivo: '' };
    }
}

btnEnviar.addEventListener('click', async () => {
    // Validar que la ubicación esté estrictamente dentro del polígono del campus (zona azul)
    if (!isPointInPolygon(currentLat, currentLng, campusCoordinates)) {
        Swal.fire('Ubicación Inválida', 'No puedes publicar el reporte si el marcador no está dentro del campus de la universidad (delimitado en azul).', 'error');
        return;
    }

    const comentario = inputComentario.value;
    const file = currentSelectedFile;

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

        // 3. Guardar en la colección "reportes" de Firestore (con prioridad inicial 1)
        const reportRef = await db.collection("reportes").add({
            texto: comentario,
            categoria: categoriaSeleccionada,
            fecha: new Date(),
            fotoUrl: urlDescarga,
            latitud: currentLat,
            longitud: currentLng,
            sector: getSectorFromCoords(currentLat, currentLng),
            autor: activeUser,
            autorNombre: activeUserName,
            prioridad: 1
        });
        
        // --- ANÁLISIS DE IA AUTOMÁTICO Y GRATUITO ---
        Swal.fire({
            title: 'Analizando con IA...',
            text: 'La Inteligencia Artificial está evaluando la prioridad y contenido del reporte...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading() }
        });

        // Autenticar de forma invisible con Puter usando un usuario temporal anónimo.
        // Esto permite que Puter AI funcione sin requerir inicio de sesión del usuario.
        try {
            if (typeof puter !== 'undefined' && puter.auth) {
                await puter.auth.signIn({ attempt_temp_user_creation: true });
            }
        } catch (puterAuthErr) {
            console.warn('Puter auth silenciosa falló, se intentará con Pollinations como fallback:', puterAuthErr);
        }
        
        const aiResult = await analyzeReportWithAI(comentario);

        if (aiResult.accion === 'eliminar' || aiResult.priority === null) {
            // Eliminar de Firestore
            await db.collection("reportes").doc(reportRef.id).delete();

            let elimTitle = 'Reporte Eliminado por la IA';
            let elimText = 'Tu reporte fue eliminado automáticamente por el sistema de moderación de SafeUSM.';

            if (aiResult.motivo === 'venta' || aiResult.isSale) {
                elimTitle = '🛑 Publicación Eliminada — Venta/Spam Detectada';
                elimText = 'Tu publicación fue eliminada porque no se permiten las ventas ni el spam comercial en esta plataforma. Los reportes deben ser incidentes reales del campus.';
            } else if (aiResult.motivo === 'inapropiado' || aiResult.isInappropriate) {
                elimTitle = '🚫 Contenido Eliminado — Normas Comunitarias';
                elimText = 'Tu contenido ha sido eliminado por infringir nuestras normas comunitarias. Los reportes que contienen lenguaje inapropiado, violencia gráfica o acoso están estrictamente prohibidos.';
            }

            Swal.fire({
                title: elimTitle,
                text: elimText,
                icon: 'warning',
                confirmButtonColor: '#ef4444',
                background: 'rgba(15, 23, 42, 0.9)'
            }).then(() => {
                navigateTo('page-home');
            });
        } else {
            // Actualizar la prioridad asignada por la IA
            await db.collection("reportes").doc(reportRef.id).update({
                prioridad: aiResult.priority
            });

            const priorityLabels = { 1: 'Muy Baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Crítica' };
            const label = priorityLabels[aiResult.priority] || 'Normal';

            Swal.fire({
                title: '✅ Reporte Publicado',
                html: `Tu incidente ya está registrado en el sistema.<br><br><strong>Prioridad asignada por IA: ${aiResult.priority}/5 (${label})</strong>`,
                icon: 'success',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            }).then(() => {
                navigateTo('page-reports-list');
            });
        }
        
        // Limpiamos los campos
        inputComentario.value = "";
        categoriaSeleccionada = "";
        fileInput.value = "";
        if (cameraInput) cameraInput.value = "";
        currentSelectedFile = null;
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
            
            const priority = reporte.prioridad !== undefined ? reporte.prioridad : 1;
            const sectorName = reporte.sector || getSectorFromCoords(reporte.latitud, reporte.longitud) || 'Patios y Áreas Verdes';
            let popupContent = `<h3>${reporte.categoria}</h3>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px; font-weight: 600;">📍 Sector: ${sectorName}</div>
                                <p>${reporte.texto}</p>
                                <div style="margin-top: 5px; font-size: 0.85rem; color: #a5b4fc; font-weight: 600;">
                                    🤖 Prioridad IA: ${priority}/5
                                </div>
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

        const sectorName = reporte.sector || getSectorFromCoords(reporte.latitud, reporte.longitud) || 'Patios y Áreas Verdes';
        let ubicacionTexto = reporte.latitud ? `📍 ${sectorName}` : "📍 Sin ubicación";
        const displayName = reporte.autorNombre || reporte.autor || 'Anónimo';
        let autorHtml = `<div style="color: #64748b; font-size: 0.8em; margin-bottom: 5px;">Reportado por: ${displayName}</div>`;
        let imgHtml = reporte.fotoUrl && reporte.fotoUrl.startsWith("http") ? `<img src="${reporte.fotoUrl}" class="report-img" alt="Foto del reporte">` : '';

        const priority = reporte.prioridad !== undefined ? reporte.prioridad : 1;
        let priorityBadge = '';
        if (priority === 5) {
            priorityBadge = `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.65em; padding: 2px 6px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🚨 Prioridad: 5 (Crítica)</span>`;
        } else if (priority === 4) {
            priorityBadge = `<span style="background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); font-size: 0.65em; padding: 2px 6px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">⚠️ Prioridad: 4 (Alta)</span>`;
        } else if (priority === 3) {
            priorityBadge = `<span style="background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); font-size: 0.65em; padding: 2px 6px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🔔 Prioridad: 3 (Media)</span>`;
        } else if (priority === 2) {
            priorityBadge = `<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.65em; padding: 2px 6px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">ℹ️ Prioridad: 2 (Baja)</span>`;
        } else if (priority === 1) {
            priorityBadge = `<span style="background: rgba(100, 116, 139, 0.15); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.3); font-size: 0.65em; padding: 2px 6px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">☕ Prioridad: 1 (Muy Baja)</span>`;
        } else if (priority === 0) {
            priorityBadge = `<span style="background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.3); font-size: 0.65em; padding: 2px 6px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🗑️ Prioridad: 0 (Descartado)</span>`;
        } else {
            priorityBadge = `<span style="background: rgba(100, 116, 139, 0.15); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.3); font-size: 0.65em; padding: 2px 6px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">☕ Prioridad: 1 (Muy Baja)</span>`;
        }

        tarjeta.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h3 style="color: white; margin-bottom: 5px; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    ${reporte.categoria}
                    ${confirmations >= 5 ? '<span style="background: var(--danger); color: white; font-size: 0.6em; padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">⚠️ CRÍTICO</span>' : ''}
                    ${priorityBadge}
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
                ${currentStaffCategory ? `
                <button class="report-action-btn delete-report-btn" title="Borrar Reporte" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.3);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Borrar</span>
                </button>
                ` : ''}
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

        // X. Borrar Reporte (Solo Encargados)
        if (currentStaffCategory) {
            const deleteReportBtn = tarjeta.querySelector('.delete-report-btn');
            if (deleteReportBtn) {
                deleteReportBtn.addEventListener('click', () => {
                    Swal.fire({
                        title: '¿Borrar Publicación?',
                        text: "Esta acción no se puede deshacer.",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#ef4444',
                        cancelButtonColor: '#64748b',
                        confirmButtonText: 'Sí, borrar',
                        cancelButtonText: 'Cancelar',
                        background: 'rgba(15, 23, 42, 0.9)'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            db.collection("reportes").doc(reporteId).delete().then(() => {
                                Swal.fire('Borrado', 'La publicación ha sido eliminada.', 'success');
                                renderFilteredReports();
                            }).catch(error => {
                                Swal.fire('Error', 'No se pudo borrar: ' + error.message, 'error');
                            });
                        }
                    });
                });
            }
        }

        // 4. Mostrar/Ocultar campos de comentario oficial
        

        // 5. Enviar Comentario (con soporte de perfiles oficiales)
        const commentForm = tarjeta.querySelector('.comment-form');
        commentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const input = commentForm.querySelector('.comment-input');
            const text = input.value.trim();
            
            let isOfficial = !!currentStaffCategory;
            let role = isOfficial ? "Encargado de " + currentStaffCategory : "Normal";
            
            if (!isOfficial) {
                const officialCheck = commentForm.querySelector('.official-checkbox');
                isOfficial = officialCheck ? officialCheck.checked : false;
            }
            
            if (isOfficial && !currentStaffCategory) {
                const selectRole = commentForm.querySelector('.official-select');
                const pinField = commentForm.querySelector('.official-pin');
                
                // Si la interfaz no tiene el select/pin agregado (no staff), caemos a normal.
                if (selectRole && pinField) {
                    const selectRoleValue = selectRole.value;
                    const pin = pinField.value;
                    
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
                    role = selectRoleValue;
                } else {
                    isOfficial = false;
                    role = "Normal";
                }
            }
            
            if (text) {
                const commentAuthor = localStorage.getItem('custom-user-name') || (currentUserEmail || "Anónimo");
                db.collection("reportes").doc(reporteId).collection("comentarios").add({
                    texto: text,
                    fecha: new Date(),
                    autor: commentAuthor,
                    likes: 0,
                    esOficial: isOfficial,
                    rolOficial: role
                }).then(() => {
                    input.value = '';
                    
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
                    
                    const displayName = (commentData.autor || 'Anónimo').includes('@') ? commentData.autor.split('@')[0] : (commentData.autor || 'Anónimo');
                    commentDiv.innerHTML = `
                        <div class="comment-content">
                            <div class="comment-meta">
                                <span class="comment-author">${displayName}</span>
                                ${metaBadge}
                                <span class="comment-date">${commentData.fecha ? commentData.fecha.toDate().toLocaleDateString() : ''}</span>
                            </div>
                            <p class="comment-text" style="${commentData.esOficial ? 'font-weight: 600; color: #fef08a;' : ''}">${commentData.texto}</p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <button class="comment-like-btn ${commentIsLiked ? 'active' : ''}" title="Me gusta">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="${commentIsLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                                <span>${commentData.likes || 0}</span>
                            </button>
                            ${currentStaffCategory ? `
                            <button class="comment-delete-btn" title="Borrar comentario" style="background: transparent; border: 1px solid var(--danger); border-radius: 20px; padding: 4px 8px; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                </svg>
                            </button>
                            ` : ''}
                        </div>
                    `;
                    
                    // Click para borrar el Comentario (Solo Encargados)
                    if (currentStaffCategory) {
                        const commentDeleteBtn = commentDiv.querySelector('.comment-delete-btn');
                        if (commentDeleteBtn) {
                            commentDeleteBtn.addEventListener('click', () => {
                                Swal.fire({
                                    title: '¿Borrar Comentario?',
                                    icon: 'warning',
                                    showCancelButton: true,
                                    confirmButtonColor: '#ef4444',
                                    cancelButtonColor: '#64748b',
                                    confirmButtonText: 'Sí, borrar',
                                    cancelButtonText: 'Cancelar',
                                    background: 'rgba(15, 23, 42, 0.9)'
                                }).then((result) => {
                                    if (result.isConfirmed) {
                                        db.collection("reportes").doc(reporteId).collection("comentarios").doc(commentId).delete().catch(error => {
                                            Swal.fire('Error', 'No se pudo borrar el comentario: ' + error.message, 'error');
                                        });
                                    }
                                });
                            });
                        }
                    }

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
function handleFileSelection(file) {
    if (!file) return;

    // Validar que el archivo sea una imagen
    if (!file.type.startsWith('image/')) {
        Swal.fire({
            title: 'Archivo no válido',
            text: 'Por favor selecciona un archivo de tipo imagen.',
            icon: 'warning',
            confirmButtonColor: '#3b82f6',
            background: 'rgba(15, 23, 42, 0.9)'
        });
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
        return;
    }

    currentSelectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewContainer.style.display = 'flex';
        if (uploadBtnText) uploadBtnText.textContent = 'Cambiar Foto';
        
        // Reajustar tamaño de los mapas por si el layout se desplaza
        setTimeout(() => {
            if (typeof formMap !== 'undefined') formMap.invalidateSize();
            if (typeof globalMap !== 'undefined') globalMap.invalidateSize();
        }, 300);
    };
    reader.readAsDataURL(file);
}

fileInput.addEventListener('change', () => {
    handleFileSelection(fileInput.files[0]);
});

if (cameraInput) {
    cameraInput.addEventListener('change', () => {
        handleFileSelection(cameraInput.files[0]);
    });
}

btnRemovePhoto.addEventListener('click', () => {
    fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
    currentSelectedFile = null;
    previewImage.src = '';
    previewContainer.style.display = 'none';
    if (uploadBtnText) uploadBtnText.textContent = 'Elegir Foto';
    
    // Reajustar tamaño de los mapas por si el layout se desplaza
    setTimeout(() => {
        if (typeof formMap !== 'undefined') formMap.invalidateSize();
        if (typeof globalMap !== 'undefined') globalMap.invalidateSize();
    }, 300);
});

// Webcam Modal para PC
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const cameraBtnWrapper = document.querySelector('.camera-btn');
const webcamModal = document.getElementById('webcam-modal');
const webcamVideo = document.getElementById('webcam-video');
const webcamCanvas = document.getElementById('webcam-canvas');
const btnCaptureWebcam = document.getElementById('btn-capture-webcam');
const btnCloseWebcam = document.getElementById('btn-close-webcam');

if (!isMobile && cameraBtnWrapper && webcamModal) {
    cameraBtnWrapper.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            webcamVideo.srcObject = stream;
            webcamModal.style.display = 'flex';
        } catch (err) {
            Swal.fire('Error', 'No se pudo acceder a la cámara.', 'error');
        }
    });

    btnCaptureWebcam.addEventListener('click', () => {
        webcamCanvas.width = webcamVideo.videoWidth;
        webcamCanvas.height = webcamVideo.videoHeight;
        webcamCanvas.getContext('2d').drawImage(webcamVideo, 0, 0);
        
        webcamCanvas.toBlob((blob) => {
            const file = new File([blob], "webcam-photo.jpg", { type: "image/jpeg" });
            handleFileSelection(file);
            closeWebcam();
        }, 'image/jpeg', 0.9);
    });

    btnCloseWebcam.addEventListener('click', closeWebcam);
    
    function closeWebcam() {
        if (webcamVideo.srcObject) {
            webcamVideo.srcObject.getTracks().forEach(track => track.stop());
        }
        webcamModal.style.display = 'none';
    }
}

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
            const theme = btn.getAttribute('data-theme');
            
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
        if (loginHeaderTitle) loginHeaderTitle.textContent = "Registrarse";
        if (loginHeaderSubtitle) loginHeaderSubtitle.textContent = "Registra una cuenta institucional USM";
        if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
        if (nameGroup) nameGroup.style.display = 'block';
        if (inputCustomConfirmPassword) inputCustomConfirmPassword.setAttribute('required', 'true');
        if (inputCustomName) inputCustomName.setAttribute('required', 'true');
        if (btnSubmitText) btnSubmitText.textContent = "Registrarse y Entrar";
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

        if (currentLoginMode === 'register') {
            if (!name || name.length < 2) {
                Swal.fire({
                    title: 'Nombre Inválido',
                    text: 'El nombre debe tener al menos 2 letras.',
                    icon: 'warning',
                    confirmButtonColor: '#3b82f6',
                    background: 'rgba(15, 23, 42, 0.9)'
                });
                return;
            }

            if (password.length < 6 || !/[A-Z]/.test(password)) {
                Swal.fire({
                    title: 'Contraseña Débil',
                    text: 'La contraseña debe tener al menos 6 caracteres y contener al menos 1 letra mayúscula.',
                    icon: 'warning',
                    confirmButtonColor: '#3b82f6',
                    background: 'rgba(15, 23, 42, 0.9)'
                });
                return;
            }
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
        const emailRegex = /^[a-zA-Z0-9._%+-]+@(usm\.cl|sansano\.usm\.cl|sansano\.cl)$/i;
        if (!emailRegex.test(email)) {
            Swal.fire({
                title: 'Correo Inválido',
                text: 'Debes utilizar un correo institucional de la USM (@usm.cl, @sansano.usm.cl o @sansano.cl).',
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
                        text: 'Este correo no está registrado en el sistema. Selecciona "Registrarse" para crear tu cuenta.',
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
              btn.addEventListener('click', async () => {
                  const email = btn.getAttribute('data-email');
                  
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
                              <div class="user-msg-item" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border-left: 3px solid var(--accent-color); display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                                  <div style="flex-grow: 1;">
                                      <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-bottom: 4px;">📅 ${rDate} - 🏷️ ${rData.categoria}</div>
                                      <div style="color: #ffffff; font-size: 0.95rem; line-height: 1.4;">${rData.texto}</div>
                                  </div>
                                  <button class="delete-user-msg-btn" data-id="${rData.id}" style="background: transparent; border: 1px solid var(--danger); border-radius: 6px; padding: 6px; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Eliminar reporte">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <polyline points="3 6 5 6 21 6"></polyline>
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                      </svg>
                                  </button>
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
                          width: '500px',
                          didOpen: () => {
                              const modal = Swal.getHtmlContainer();
                              const deleteButtons = modal.querySelectorAll('.delete-user-msg-btn');
                              deleteButtons.forEach(delBtn => {
                                  delBtn.addEventListener('click', () => {
                                      const reportId = delBtn.getAttribute('data-id');
                                      
                                      Swal.fire({
                                          title: '¿Eliminar este reporte?',
                                          text: 'Esta acción no se puede deshacer.',
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
                                                  await db.collection("reportes").doc(reportId).delete();
                                                  
                                                  Swal.fire({
                                                      title: 'Eliminado',
                                                      text: 'El reporte ha sido eliminado.',
                                                      icon: 'success',
                                                      background: 'rgba(15, 23, 42, 0.9)',
                                                      timer: 1500,
                                                      showConfirmButton: false
                                                  }).then(() => {
                                                      const originalBtn = document.querySelector(`.show-messages-btn[data-email="${email}"]`);
                                                      if (originalBtn) {
                                                          originalBtn.click();
                                                      }
                                                  });
                                              } catch (error) {
                                                  Swal.fire('Error', 'No se pudo eliminar: ' + error.message, 'error');
                                              }
                                          }
                                      });
                                  });
                              });
                          }
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
                                         
                                         const priority = rData.prioridad !== undefined ? rData.prioridad : 1;
                                         let priorityText = '';
                                         if (priority === 5) priorityText = '🚨 Crítica';
                                         else if (priority === 4) priorityText = '⚠️ Alta';
                                         else if (priority === 3) priorityText = '🔔 Media';
                                         else if (priority === 2) priorityText = 'ℹ️ Baja';
                                         else if (priority === 1) priorityText = '☕ Muy Baja';
                                         else if (priority === 0) priorityText = '🗑️ Descartado';
                                         else priorityText = '☕ Muy Baja';

                                         const ownSector = rData.sector || (rData.latitud ? getSectorFromCoords(rData.latitud, rData.longitud) : 'Patios y Áreas Verdes');

                                         card.innerHTML = `
                                             <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 4px;">
                                                 <strong style="color: white; font-size: 0.95rem;">${rData.categoria} <span style="font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.4); margin-left: 6px;">(IA: ${priorityText})</span></strong>
                                                 <small style="color: rgba(255,255,255,0.4); font-size: 0.75rem;">${dateStr}</small>
                                             </div>
                                             <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 8px; font-weight: 600;">📍 Sector: ${ownSector}</div>
                                             <p style="color: #cbd5e1; font-size: 0.85rem; margin: 0 0 0.75rem 0; line-height: 1.4;">${rData.texto}</p>
                                             <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                                                 <div style="display: flex; gap: 0.75rem; font-size: 0.75rem; color: var(--text-secondary);">
                                                     <span>❤️ ${rData.likes || 0} Likes</span>
                                                     <span>Confirmaciones (${rData.confirmations || 0})</span>
                                                 </div>
                                                 <button class="delete-own-report-btn" style="background: transparent; border: 1px solid var(--danger); border-radius: 6px; padding: 4px 8px; color: var(--danger); cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
                                                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                         <polyline points="3 6 5 6 21 6"></polyline>
                                                         <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                                     </svg>
                                                     Eliminar
                                                 </button>
                                             </div>
                                         `;
                                         myReportsContainer.appendChild(card);
                                         
                                         const deleteBtn = card.querySelector('.delete-own-report-btn');
                                         if (deleteBtn) {
                                             deleteBtn.addEventListener('click', () => {
                                                 Swal.fire({
                                                     title: '¿Eliminar tu reporte?',
                                                     text: "Esta acción no se puede deshacer.",
                                                     icon: 'warning',
                                                     showCancelButton: true,
                                                     confirmButtonColor: '#ef4444',
                                                     cancelButtonColor: '#3b82f6',
                                                     confirmButtonText: 'Sí, eliminar',
                                                     cancelButtonText: 'Cancelar',
                                                     background: 'rgba(15, 23, 42, 0.9)'
                                                 }).then((result) => {
                                                     if (result.isConfirmed) {
                                                         db.collection("reportes").doc(rData.id).delete().then(() => {
                                                             Swal.fire({
                                                                 title: 'Eliminado',
                                                                 text: 'Tu reporte ha sido eliminado correctamente.',
                                                                 icon: 'success',
                                                                 confirmButtonColor: '#3b82f6',
                                                                 background: 'rgba(15, 23, 42, 0.9)'
                                                             });
                                                         }).catch(error => {
                                                             Swal.fire('Error', 'No se pudo eliminar el reporte: ' + error.message, 'error');
                                                         });
                                                     }
                                                 });
                                             });
                                         }
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
        navigateTo('page-welcome');
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

// --- LÓGICA DE CONFIGURACIÓN DE REGLAS DE IA (PÁGINA 8) ---
const textareaAiRules = document.getElementById('ai-custom-rules');
const btnSaveAiRules = document.getElementById('btn-save-ai-rules');
const btnBackAiRules = document.getElementById('btn-back-ai-rules');

const DEFAULT_AI_RULES = `SISTEMA DE REGLAS PARA MODERACIÓN Y PRIORIZACIÓN DE REPORTES EN CAMPUS UNIVERSITARIO

=== PASO 1: FILTROS DE ELIMINACIÓN AUTOMÁTICA (PRIORIDAD MÁXIMA) ===
Antes de asignar prioridad, verifica si el contenido activa alguna de estas reglas de bloqueo:

REGLA A - VENTAS Y SPAM COMERCIAL:
Eliminar si el texto incluye: ofertas de productos o servicios, enlaces de afiliados, códigos de descuento personales, solicitudes de dinero, precios de artículos, publicidad de negocios, palabras clave como "vendo", "compro", "disponible al por mayor", "interesados al DM", "oferta", "precio", "descuento", "WhatsApp para más info".
Acción: { "priority": null, "accion": "eliminar", "motivo": "venta" }

REGLA B - CONTENIDO INAPROPIADO (Desnudez, Violencia, Acoso):
Eliminar si la descripción textual menciona: desnudez total o parcial, pornografía, insinuaciones sexuales explícitas, violencia gráfica, discursos de odio, acoso, amenazas físicas o discriminación.
Acción: { "priority": null, "accion": "eliminar", "motivo": "inapropiado" }

=== PASO 2: MATRIZ DE PRIORIDADES (si no aplican los filtros anteriores) ===
Asigna una prioridad del 1 al 5 según el impacto del incidente en la comunidad universitaria:

Prioridad 1 (Muy Baja): Contenido trivial, saludos, agradecimientos, charlas casuales sin acción requerida.
Prioridad 2 (Baja): Consultas generales, preguntas frecuentes, comentarios informativos comunes.
Prioridad 3 (Media): Reportes de fallos menores del entorno (una luz quemada, una silla rota), sugerencias de mejora, dudas técnicas.
Prioridad 4 (Alta): Problemas que afectan a varios usuarios (acceso bloqueado, infraestructura dañada, peleas sin violencia inmediata, acoso verbal).
Prioridad 5 (Muy Alta / Crítica): Emergencias de seguridad (incendio, pelea con violencia física, robo, accidente, persona desmayada, amenaza de seguridad), situaciones que requieren atención humana inmediata.

Acción para contenido aprobado: { "priority": <1-5>, "accion": "aprobar", "motivo": "" }`;

async function loadAiRules() {
    if (!textareaAiRules) return;
    
    textareaAiRules.disabled = true;
    textareaAiRules.value = "Cargando reglas...";
    
    try {
        const doc = await db.collection("config").doc("ia_rules").get();
        if (doc.exists && doc.data().rules) {
            textareaAiRules.value = doc.data().rules;
        } else {
            textareaAiRules.value = DEFAULT_AI_RULES;
        }
    } catch (error) {
        console.error("Error al cargar reglas de IA:", error);
        textareaAiRules.value = DEFAULT_AI_RULES;
    } finally {
        textareaAiRules.disabled = false;
    }
}

if (btnSaveAiRules) {
    btnSaveAiRules.addEventListener('click', async () => {
        const rules = textareaAiRules ? textareaAiRules.value.trim() : '';
        if (!rules) {
            Swal.fire('Error', 'Las reglas no pueden estar vacías.', 'warning');
            return;
        }
        
        btnSaveAiRules.disabled = true;
        const originalText = btnSaveAiRules.innerHTML;
        btnSaveAiRules.innerHTML = "<span>Guardando...</span>";
        
        try {
            await db.collection("config").doc("ia_rules").set({
                rules: rules,
                ultimaActualizacion: new Date()
            });
            
            Swal.fire({
                title: 'Reglas Guardadas',
                text: 'Las nuevas reglas de análisis de IA se han aplicado correctamente.',
                icon: 'success',
                confirmButtonColor: '#3b82f6',
                background: 'rgba(15, 23, 42, 0.9)'
            });
        } catch (error) {
            console.error("Error al guardar reglas de IA:", error);
            Swal.fire('Error', 'No se pudieron guardar las reglas: ' + error.message, 'error');
        } finally {
            btnSaveAiRules.disabled = false;
            btnSaveAiRules.innerHTML = originalText;
        }
    });
}

if (btnBackAiRules) {
    btnBackAiRules.addEventListener('click', () => {
        navigateTo('page-welcome');
    });
}

// --- FUNCIONES DEL EDITOR DE SECTORES ---
function promptForSectorEditing() {
    Swal.fire({
        title: 'Acceso Restringido',
        text: 'Ingrese la contraseña para configurar los sectores del mapa:',
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
            if (result.value === '1234') {
                navigateTo('page-edit-map-sectors');
            } else {
                Swal.fire({
                    title: 'Acceso Denegado',
                    text: 'Contraseña incorrecta.',
                    icon: 'error',
                    confirmButtonColor: '#3b82f6',
                    background: 'rgba(15, 23, 42, 0.9)'
                });
            }
        }
    });
}

function setupEditorMap() {
    if (editorMap) return;
    editorMap = L.map('editor-map', mapOptions).setView(usmSanJoaquin, 17);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(editorMap);

    // Dibujar polígono del campus como referencia
    editorCampusPolygon = L.polygon(campusCoordinates, {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.02,
        weight: 2,
        dashArray: '5, 8',
        interactive: false
    }).addTo(editorMap);
}

function loadSectorsInEditorList() {
    tempSectores = JSON.parse(JSON.stringify(sectores));
    refreshSectorSelect(0);
}

function refreshSectorSelect(selectedIndex) {
    const select = document.getElementById('editor-sector-select');
    if (!select) return;
    select.innerHTML = "";
    tempSectores.forEach((sec, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = sec.name;
        if (idx === selectedIndex) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
    loadSectorInEditor(selectedIndex);
}

function loadSectorInEditor(index) {
    if (!editorMap) setupEditorMap();

    // Limpiar capas previas
    if (editorPolygon) {
        editorMap.removeLayer(editorPolygon);
        editorPolygon = null;
    }
    editorMarkers.forEach(m => editorMap.removeLayer(m));
    editorMarkers = [];

    editorBackgroundPolygons.forEach(p => editorMap.removeLayer(p));
    editorBackgroundPolygons = [];

    if (tempSectores.length === 0 || index < 0 || index >= tempSectores.length) {
        return;
    }

    const currentSector = tempSectores[index];

    // Cargar inputs
    const nameInput = document.getElementById('editor-sector-name');
    const colorInput = document.getElementById('editor-sector-color');
    const colorHexInput = document.getElementById('editor-sector-color-hex');

    if (nameInput) nameInput.value = currentSector.name;
    if (colorInput) colorInput.value = currentSector.color || '#3b82f6';
    if (colorHexInput) colorHexInput.value = currentSector.color || '#3b82f6';

    // Dibujar otros sectores de fondo (estáticos)
    tempSectores.forEach((sec, idx) => {
        if (idx !== index) {
            const bgPoly = L.polygon(sec.polygon, {
                color: sec.color || '#94a3b8',
                fillColor: sec.color || '#94a3b8',
                fillOpacity: 0.05,
                weight: 1.5,
                dashArray: '3, 6',
                interactive: false
            }).addTo(editorMap);
            editorBackgroundPolygons.push(bgPoly);
        }
    });

    // Dibujar el polígono activo para edición
    editorPolygon = L.polygon(currentSector.polygon, {
        color: currentSector.color || '#3b82f6',
        fillColor: currentSector.color || '#3b82f6',
        fillOpacity: 0.35,
        weight: 3
    }).addTo(editorMap);

    // Centrar en el sector si tiene coordenadas
    if (currentSector.polygon.length > 0) {
        try {
            editorMap.fitBounds(editorPolygon.getBounds(), { padding: [30, 30] });
        } catch (e) {
            editorMap.setView(usmSanJoaquin, 17);
        }
    }

    // Dibujar marcadores arrastrables (Handles) en cada vértice (esquina) del sector
    currentSector.polygon.forEach((coords, idx) => {
        const handleIcon = L.divIcon({
            className: 'custom-vertex-handle',
            html: `<div style="width: 14px; height: 14px; background-color: #fbbf24; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.6); cursor: grab;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        const marker = L.marker(coords, {
            icon: handleIcon,
            draggable: true
        }).addTo(editorMap);

        // Última posición válida (sin superposición)
        marker._lastValidLatLng = L.latLng(coords[0], coords[1]);

        // Durante el arrastre: bloquear en tiempo real si entra en otro sector
        marker.on('drag', (e) => {
            const newPos = marker.getLatLng();
            
            // Comprobar si la nueva posición cae dentro de cualquier otro sector
            let blocked = false;
            for (let i = 0; i < tempSectores.length; i++) {
                if (i === index) continue;
                if (isPointInPolygon(newPos.lat, newPos.lng, tempSectores[i].polygon)) {
                    blocked = true;
                    break;
                }
            }

            // También comprobar si algún vértice vecino quedaría dentro del polígono editado
            if (!blocked) {
                const testPolygon = currentSector.polygon.map((c, ci) => ci === idx ? [newPos.lat, newPos.lng] : c);
                for (let i = 0; i < tempSectores.length; i++) {
                    if (i === index) continue;
                    for (const pt of tempSectores[i].polygon) {
                        if (isPointInPolygon(pt[0], pt[1], testPolygon)) {
                            blocked = true;
                            break;
                        }
                    }
                    if (blocked) break;
                }
            }

            if (blocked) {
                // Devolver el marcador a la última posición válida instantáneamente
                marker.setLatLng(marker._lastValidLatLng);
            } else {
                // Posición válida: actualizar el polígono y guardar como última válida
                marker._lastValidLatLng = L.latLng(newPos.lat, newPos.lng);
                currentSector.polygon[idx] = [newPos.lat, newPos.lng];
                editorPolygon.setLatLngs(currentSector.polygon);
            }
        });

        // Al soltar, asegurarse de que la coordenada final es la última válida
        marker.on('dragend', (e) => {
            const finalPos = marker._lastValidLatLng;
            marker.setLatLng(finalPos);
            currentSector.polygon[idx] = [finalPos.lat, finalPos.lng];
            editorPolygon.setLatLngs(currentSector.polygon);
        });

        editorMarkers.push(marker);
    });
}

function updateActiveSectorColor(newColor) {
    const select = document.getElementById('editor-sector-select');
    if (!select) return;
    const index = parseInt(select.value, 10);
    if (index >= 0 && index < tempSectores.length) {
        tempSectores[index].color = newColor;
        if (editorPolygon) {
            editorPolygon.setStyle({
                color: newColor,
                fillColor: newColor
            });
        }
    }
}

// --- EDITOR DE PERÍMETRO EXTERIOR DEL CAMPUS ---
let isEditingPerimeter = false;
let perimeterHandles = [];        // Marcadores arrastrables del perímetro
let perimeterPolygonLayer = null; // Capa del polígono del perímetro en el editor
let tempCampusCoords = [];        // Copia temporal de campusCoordinates para editar

function enterPerimeterEditMode() {
    if (!editorMap) setupEditorMap();

    // Limpiar estado del editor de sectores (quitar handles de sectores)
    if (editorPolygon) { editorMap.removeLayer(editorPolygon); editorPolygon = null; }
    editorMarkers.forEach(m => editorMap.removeLayer(m));
    editorMarkers = [];
    editorBackgroundPolygons.forEach(p => editorMap.removeLayer(p));
    editorBackgroundPolygons = [];

    // Ocultar controles de sectores mientras se edita el perímetro
    const sectorControls = document.getElementById('editor-sector-select');
    if (sectorControls) sectorControls.closest('div[style]').style.opacity = '0.4';

    // Copiar coordenadas actuales para edición temporal
    tempCampusCoords = campusCoordinates.map(c => [...c]);

    // Dibujar polígono del perímetro editable (morado)
    if (perimeterPolygonLayer) editorMap.removeLayer(perimeterPolygonLayer);
    perimeterPolygonLayer = L.polygon(tempCampusCoords, {
        color: '#8b5cf6',
        fillColor: '#8b5cf6',
        fillOpacity: 0.12,
        weight: 3,
        dashArray: null
    }).addTo(editorMap);

    // Centrar mapa en el perímetro
    try { editorMap.fitBounds(perimeterPolygonLayer.getBounds(), { padding: [30, 30] }); }
    catch(e) { editorMap.setView(usmSanJoaquin, 17); }

    renderPerimeterHandles();

    // Mostrar botones de perímetro
    document.getElementById('btn-editor-add-perimeter-vertex').style.display = '';
    document.getElementById('btn-editor-delete-perimeter-vertex').style.display = '';
    document.getElementById('btn-editor-save-perimeter').style.display = '';
    document.getElementById('perimeter-editor-tip').style.display = '';
    document.getElementById('btn-editor-edit-perimeter').textContent = '🚫 Salir del Editor de Perímetro';
    document.getElementById('btn-editor-edit-perimeter').style.background = 'rgba(239,68,68,0.1)';
    document.getElementById('btn-editor-edit-perimeter').style.borderColor = 'rgba(239,68,68,0.3)';
    document.getElementById('btn-editor-edit-perimeter').style.color = '#f87171';

    isEditingPerimeter = true;
}

function exitPerimeterEditMode() {
    // Limpiar handles del perímetro
    perimeterHandles.forEach(m => editorMap.removeLayer(m));
    perimeterHandles = [];

    // Quitar polígono temporal
    if (perimeterPolygonLayer) { editorMap.removeLayer(perimeterPolygonLayer); perimeterPolygonLayer = null; }

    // Restaurar opacidad de controles de sectores
    const sectorControls = document.getElementById('editor-sector-select');
    if (sectorControls) sectorControls.closest('div[style]').style.opacity = '1';

    // Ocultar botones de perímetro
    document.getElementById('btn-editor-add-perimeter-vertex').style.display = 'none';
    document.getElementById('btn-editor-delete-perimeter-vertex').style.display = 'none';
    document.getElementById('btn-editor-save-perimeter').style.display = 'none';
    document.getElementById('perimeter-editor-tip').style.display = 'none';
    document.getElementById('btn-editor-edit-perimeter').textContent = '🗺️ Editar Perímetro Exterior';
    document.getElementById('btn-editor-edit-perimeter').style.background = 'rgba(139, 92, 246, 0.15)';
    document.getElementById('btn-editor-edit-perimeter').style.borderColor = 'rgba(139, 92, 246, 0.4)';
    document.getElementById('btn-editor-edit-perimeter').style.color = '#a78bfa';

    isEditingPerimeter = false;

    // Recargar sector editor
    loadSectorsInEditorList();
}

function renderPerimeterHandles() {
    // Limpiar handles anteriores
    perimeterHandles.forEach(m => editorMap.removeLayer(m));
    perimeterHandles = [];

    tempCampusCoords.forEach((coords, idx) => {
        const handleIcon = L.divIcon({
            className: '',
            html: `<div style="width:16px;height:16px;background:#8b5cf6;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(139,92,246,0.7);cursor:grab;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        const marker = L.marker([coords[0], coords[1]], {
            icon: handleIcon,
            draggable: true
        }).addTo(editorMap);

        marker.on('drag', () => {
            const pos = marker.getLatLng();
            tempCampusCoords[idx] = [pos.lat, pos.lng];
            perimeterPolygonLayer.setLatLngs(tempCampusCoords);
        });

        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            tempCampusCoords[idx] = [pos.lat, pos.lng];
            perimeterPolygonLayer.setLatLngs(tempCampusCoords);
        });

        perimeterHandles.push(marker);
    });
}

// Botón: Activar/Desactivar editor de perímetro
const btnEditPerimeter = document.getElementById('btn-editor-edit-perimeter');
if (btnEditPerimeter) {
    btnEditPerimeter.addEventListener('click', () => {
        if (isEditingPerimeter) {
            exitPerimeterEditMode();
        } else {
            enterPerimeterEditMode();
        }
    });
}

// Botón: Añadir vértice al perímetro (lo inserta en el centro del mapa)
const btnAddPerimeterVertex = document.getElementById('btn-editor-add-perimeter-vertex');
if (btnAddPerimeterVertex) {
    btnAddPerimeterVertex.addEventListener('click', () => {
        if (!isEditingPerimeter) return;
        const center = editorMap.getCenter();
        tempCampusCoords.push([center.lat, center.lng]);
        perimeterPolygonLayer.setLatLngs(tempCampusCoords);
        renderPerimeterHandles();
    });
}

// Botón: Quitar último vértice del perímetro
const btnDeletePerimeterVertex = document.getElementById('btn-editor-delete-perimeter-vertex');
if (btnDeletePerimeterVertex) {
    btnDeletePerimeterVertex.addEventListener('click', () => {
        if (!isEditingPerimeter || tempCampusCoords.length <= 3) {
            Swal.fire({ title: 'Mínimo 3 vértices', text: 'El perímetro necesita al menos 3 puntos.', icon: 'warning', background: 'rgba(15,23,42,0.9)', confirmButtonColor: '#8b5cf6' });
            return;
        }
        tempCampusCoords.pop();
        perimeterPolygonLayer.setLatLngs(tempCampusCoords);
        renderPerimeterHandles();
    });
}

// Botón: Guardar perímetro en Firestore y aplicar en tiempo real
const btnSavePerimeter = document.getElementById('btn-editor-save-perimeter');
if (btnSavePerimeter) {
    btnSavePerimeter.addEventListener('click', async () => {
        if (!isEditingPerimeter || !perimeterPolygonLayer) return;

        btnSavePerimeter.disabled = true;
        btnSavePerimeter.innerHTML = '<span>Guardando...</span>';

        try {
            // Obtener las coordenadas directamente desde la capa de Leaflet.
            // getLatLngs() devuelve [[LatLng, LatLng, ...]] para polígonos simples.
            // Aplanamos el primer nivel y extraemos únicamente lat y lng como números primitivos
            // para que Firestore no reciba arreglos anidados ni objetos con métodos.
            const rawLatLngs = perimeterPolygonLayer.getLatLngs();

            // Aplanar recursivamente hasta llegar a objetos LatLng con .lat y .lng numéricos
            const cleanCoords = [];
            function flattenLatLngs(arr) {
                arr.forEach(item => {
                    if (Array.isArray(item)) {
                        flattenLatLngs(item);
                    } else if (item && typeof item.lat === 'number' && typeof item.lng === 'number') {
                        cleanCoords.push({ lat: item.lat, lng: item.lng });
                    }
                });
            }
            flattenLatLngs(rawLatLngs);

            if (cleanCoords.length < 3) {
                throw new Error('No se encontraron suficientes vértices en el polígono del perímetro.');
            }

            // Guardar en Firestore como arreglo de objetos planos (sin arreglos anidados)
            await db.collection('config').doc('campus_perimeter').set({
                coordinates: cleanCoords,
                updatedAt: new Date()
            });

            // Actualizar campusCoordinates en memoria con arreglos [lat, lng] para Leaflet interno
            campusCoordinates.length = 0;
            cleanCoords.forEach(c => campusCoordinates.push([c.lat, c.lng]));

            // Actualizar también tempCampusCoords para consistencia
            tempCampusCoords.length = 0;
            campusCoordinates.forEach(c => tempCampusCoords.push([...c]));

            // Actualizar dinámicamente las capas de polígono en los mapas
            if (formCampusPolygon) formCampusPolygon.setLatLngs(campusCoordinates);
            if (globalCampusPolygon) globalCampusPolygon.setLatLngs(campusCoordinates);
            if (editorCampusPolygon) editorCampusPolygon.setLatLngs(campusCoordinates);

            Swal.fire({
                title: '✅ Perímetro Guardado',
                text: 'El nuevo límite del campus ha sido aplicado. Los reportes solo se podrán publicar dentro del área definida.',
                icon: 'success',
                confirmButtonColor: '#8b5cf6',
                background: 'rgba(15, 23, 42, 0.9)'
            });

            exitPerimeterEditMode();
        } catch (error) {
            console.error('Error al guardar perímetro:', error);
            Swal.fire({ title: 'Error', text: 'No se pudo guardar el perímetro: ' + error.message, icon: 'error', background: 'rgba(15,23,42,0.9)' });
        } finally {
            btnSavePerimeter.disabled = false;
            btnSavePerimeter.innerHTML = '💾 Guardar Perímetro';
        }
    });
}

// Al iniciar la app, cargar el perímetro guardado en Firestore si existe
async function loadSavedPerimeter() {
    try {
        const doc = await db.collection('config').doc('campus_perimeter').get();
        if (doc.exists && doc.data().coordinates && doc.data().coordinates.length >= 3) {
            const saved = doc.data().coordinates;
            campusCoordinates.length = 0;
            saved.forEach(c => {
                if (Array.isArray(c)) {
                    campusCoordinates.push(c);
                } else if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
                    campusCoordinates.push([c.lat, c.lng]);
                }
            });
            console.log(`Perímetro del campus cargado desde Firestore (${campusCoordinates.length} vértices).`);
            
            // Actualizar dinámicamente las capas de polígono en los mapas si ya están instanciadas
            if (formCampusPolygon) formCampusPolygon.setLatLngs(campusCoordinates);
            if (globalCampusPolygon) globalCampusPolygon.setLatLngs(campusCoordinates);
            if (editorCampusPolygon) editorCampusPolygon.setLatLngs(campusCoordinates);
        }
    } catch (e) {
        console.warn('No se pudo cargar el perímetro desde Firestore, usando el por defecto.', e);
    }
}
loadSavedPerimeter();

// --- INICIALIZACIÓN DE LA APP ---
window.addEventListener('DOMContentLoaded', () => {
    // Siempre mostrar la pantalla de bienvenida con el logo al cargar
    navigateTo('page-welcome');
});

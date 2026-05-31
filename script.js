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

// --- MAPAS LEAFLET ---
const usmSanJoaquin = [-33.4933, -70.6150];
let currentLat = usmSanJoaquin[0];
let currentLng = usmSanJoaquin[1];

// Límites geográficos para restringir el mapa al área general del campus y alrededores (San Joaquín, desplazado al oeste)
const boundsSanJoaquin = L.latLngBounds(
    L.latLng(-33.5000, -70.6257), // Esquina Suroeste
    L.latLng(-33.4866, -70.6123)  // Esquina Noreste
);

// Opciones de configuración para restringir la navegación
const mapOptions = {
    maxBounds: boundsSanJoaquin,
    maxBoundsViscosity: 1.0, // Impide arrastrar el mapa fuera de los límites definidos
    minZoom: 15,             // Impide alejarse demasiado (evita ver todo el país)
    maxZoom: 19              // Límite de zoom de acercamiento
};

// 1. Mapa del Formulario
const formMap = L.map('form-map', mapOptions).setView(usmSanJoaquin, 16);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap'
}).addTo(formMap);

const formMarker = L.marker(usmSanJoaquin, {draggable: true}).addTo(formMap);
formMarker.on('dragend', function(e) {
    const pos = formMarker.getLatLng();
    currentLat = pos.lat;
    currentLng = pos.lng;
});
formMap.on('click', function(e) {
    formMarker.setLatLng(e.latlng);
    currentLat = e.latlng.lat;
    currentLng = e.latlng.lng;
});

// Botón de Geolocalización
const btnLocation = document.getElementById('btn-location');
const locationStatus = document.getElementById('location-status');
btnLocation.addEventListener('click', () => {
    locationStatus.textContent = "Obteniendo ubicación...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                currentLat = position.coords.latitude;
                currentLng = position.coords.longitude;
                const newPos = [currentLat, currentLng];
                formMap.setView(newPos, 18);
                formMarker.setLatLng(newPos);
                locationStatus.textContent = "Ubicación obtenida.";
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
const globalMap = L.map('global-map', mapOptions).setView(usmSanJoaquin, 16);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap'
}).addTo(globalMap);
let globalMarkers = []; // Array para guardar los pines actuales

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

        // 3. Guardar en la colección "reportes" de Firestore
        await db.collection("reportes").add({
            texto: comentario,
            categoria: categoriaSeleccionada,
            fecha: new Date(),
            fotoUrl: urlDescarga,
            latitud: currentLat,
            longitud: currentLng,
            autor: currentUserEmail
        });
        
        Swal.fire({
            title: '¡Reporte Enviado!',
            text: 'El aviso y la foto ya están en el sistema.',
            icon: 'success',
            confirmButtonColor: '#3b82f6',
            background: 'rgba(15, 23, 42, 0.9)'
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
        let autorHtml = reporte.autor ? `<div style="color: #64748b; font-size: 0.8em; margin-bottom: 5px;">Reportado por: ${reporte.autor}</div>` : '';
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
const btnSettings = document.getElementById('btn-settings');
const accessibilityModal = document.getElementById('accessibility-modal');
const btnCloseAccessibility = document.getElementById('btn-close-accessibility');
const accessBtns = document.querySelectorAll('.access-btn');

// Cargar preferencia guardada al inicio
const savedTheme = localStorage.getItem('safeusm-theme') || 'default';
if (savedTheme !== 'default') {
    document.documentElement.setAttribute('data-theme', savedTheme);
}
updateActiveAccessBtn(savedTheme);

if (btnSettings && accessibilityModal) {
    btnSettings.addEventListener('click', () => {
        accessibilityModal.style.display = 'flex';
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
} else if (btnSettings) {
    btnSettings.addEventListener('click', () => {
        Swal.fire({
            title: 'Actualización Requerida',
            text: 'Parece que tu navegador guardó una versión antigua. Por favor recarga presionando Ctrl + Shift + R.',
            icon: 'info',
            background: 'rgba(15, 23, 42, 0.95)'
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

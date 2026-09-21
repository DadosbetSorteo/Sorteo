import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, increment, collection, query, where, getDocs, onSnapshot, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDl5c6Ytt5hZ6S8yqKIs1YW0SJRAECvejw",
  authDomain: "dadosbet-sorteos.firebaseapp.com",
  projectId: "dadosbet-sorteos",
  storageBucket: "dadosbet-sorteos.firebasestorage.app",
  messagingSenderId: "251841265433",
  appId: "1:251841265433:web:d882e429805cfbca54cf88"
};

// URL DO GOOGLE APPS SCRIPT ATUALIZADA COM O SEU LINK
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxajf27Q6b13NfQcL-70qUpADmUMvTF9knL50qi-sNrAmdhbKuGGBNQT6ZUed3bzIFK/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = null;
let currentBanners = [];
let listaProductosDB = [];

// INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", () => {
  const btnTheme = document.getElementById("btnThemeToggle");

  const currentTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  actualizarIconoTema(currentTheme);

  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      let theme = document.documentElement.getAttribute("data-theme");
      let newTheme = (theme === "dark") ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);
      actualizarIconoTema(newTheme);
    });
  }

  escucharProductosFirebase();
  escucharBannersFirebase();
  verificarPopUpPromo();
});

function actualizarIconoTema(theme) {
  const themeIcon = document.getElementById("themeIcon");
  if (themeIcon) {
    themeIcon.className = (theme === "dark") ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
}

// AUTH LISTENER
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await cargarDatosUsuario(user.uid);
    actualizarInterfazUsuarioLogueado();
  } else {
    currentUser = null;
    currentUserData = null;
    actualizarInterfazDeslogueado();
  }
});

// 1. CARROUSEL / BANNERS
function escucharBannersFirebase() {
  onSnapshot(doc(db, "configuracion", "banners"), (docSnap) => {
    const carouselTrack = document.getElementById("carouselTrack");
    const carouselIndicators = document.getElementById("carouselIndicators");
    if (!carouselTrack) return;

    if (docSnap.exists() && docSnap.data().list && docSnap.data().list.length > 0) {
      currentBanners = docSnap.data().list;
    } else {
      currentBanners = [
        "https://via.placeholder.com/1920x500/111/ffc107?text=CARGA+10.000+Y+CONSIGUE+TU+TICKET+GRATIS",
        "https://via.placeholder.com/1920x500/004085/ffffff?text=GRANDES+PREMIOS+EN+EFECTIVO+Y+TECNOLOGIA"
      ];
    }

    carouselTrack.innerHTML = "";
    carouselIndicators.innerHTML = "";

    currentBanners.forEach((url, idx) => {
      carouselTrack.innerHTML += `
        <div class="slide ${idx === 0 ? 'active' : ''}">
          <img src="${url}" alt="Banner ${idx + 1}">
        </div>
      `;
      carouselIndicators.innerHTML += `
        <span class="dot ${idx === 0 ? 'active' : ''}" onclick="setSlide(${idx})"></span>
      `;
    });
  });
}

let currentSlide = 0;
window.moveSlide = function(dir) {
  const slides = document.querySelectorAll(".slide");
  if (slides.length === 0) return;
  currentSlide = (currentSlide + dir + slides.length) % slides.length;
  actualizarPosicionCarrusel();
};

window.setSlide = function(index) {
  currentSlide = index;
  actualizarPosicionCarrusel();
};

function actualizarPosicionCarrusel() {
  const carouselTrack = document.getElementById("carouselTrack");
  const dots = document.querySelectorAll(".dot");
  if (carouselTrack) {
    carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
  }
  dots.forEach((dot, idx) => {
    dot.classList.toggle("active", idx === currentSlide);
  });
}

window.guardarBannersAdmin = async function() {
  const b1 = document.getElementById("bannerUrl1").value.trim();
  const b2 = document.getElementById("bannerUrl2").value.trim();
  const b3 = document.getElementById("bannerUrl3").value.trim();

  const list = [b1, b2, b3].filter(url => url !== "");

  if (list.length === 0) {
    alert("Por favor ingresa al menos la URL de un banner.");
    return;
  }

  try {
    await setDoc(doc(db, "configuracion", "banners"), { list: list });
    alert("Banners actualizados correctamente.");
  } catch (err) {
    alert("Error al guardar banners: " + err.message);
  }
};

// 2. PRODUCTOS COMPLETO CON SANITIZACIÓN DE BARRAS DE LINK E SINCRO
function escucharProductosFirebase() {
  onSnapshot(collection(db, "productos"), (snapshot) => {
    listaProductosDB = [];
    snapshot.forEach(docSnap => {
      listaProductosDB.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderizarPremios();
    renderizarListaProductosAdmin();
  });
}

function renderizarPremios() {
  const container = document.getElementById("gridProductos");
  if (!container) return;
  container.innerHTML = "";

  if (listaProductosDB.length === 0) {
    container.innerHTML = "<p style='text-align:center; grid-column: 1/-1;'>No hay sorteos disponibles actualmente.</p>";
    return;
  }

  listaProductosDB.forEach(p => {
    const q = query(collection(db, "reservas"), where("premioId", "==", p.id));
    onSnapshot(q, (snapshot) => {
      const ocupados = snapshot.size;
      const disponibles = 500 - ocupados;
      const porcentaje = Math.round((ocupados / 500) * 100);

      const cardHtml = `
        <div class="card-producto">
          <div class="card-img-container"><img src="${p.imgs[0]}" alt="${p.nombre}"></div>
          <div class="card-content">
            <h3 class="producto-titulo">${p.nombre}</h3>
            <div class="producto-precio-info"><span class="carga-minima">Mínimo de carga: <strong>$${p.monto.toLocaleString()}</strong></span></div>
            <div class="tickets-progress-container">
              <div class="tickets-labels">
                <span>Disponibles: <strong>${disponibles}</strong>/500</span>
                <span>Ocupados: <strong>${ocupados}</strong></span>
              </div>
              <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${porcentaje}%;"></div></div>
            </div>
            <button class="btn-elegir-numero" onclick="abrirModalNumeros('${p.id}')">Elegir Número <i class="fa-solid fa-arrow-right"></i></button>
          </div>
        </div>
      `;
      
      const existingCard = document.getElementById(`card_${p.id}`);
      if (existingCard) {
        existingCard.outerHTML = `<div id="card_${p.id}">${cardHtml}</div>`;
      } else {
        container.innerHTML += `<div id="card_${p.id}">${cardHtml}</div>`;
      }
    });
  });
}

window.guardarProductoAdmin = async function() {
  const name = document.getElementById("newProdName").value.trim();
  const price = parseInt(document.getElementById("newProdPrice").value);
  const img1 = document.getElementById("newProdImg1").value.trim();
  const img2 = document.getElementById("newProdImg2").value.trim();
  const img3 = document.getElementById("newProdImg3").value.trim();

  if (!name || isNaN(price) || !img1) { 
    alert("Ingresa el nombre, precio y al menos la URL de la imagen principal."); 
    return; 
  }

  const imgsArr = [img1, img2, img3].filter(url => url !== "");
  const newId = `premio_${Date.now()}`;

  try {
    await setDoc(doc(db, "productos", newId), {
      nombre: name,
      monto: price,
      imgs: imgsArr,
      fechaCreacion: new Date().toISOString()
    });

    document.getElementById("newProdName").value = "";
    document.getElementById("newProdPrice").value = "";
    document.getElementById("newProdImg1").value = "";
    document.getElementById("newProdImg2").value = "";
    document.getElementById("newProdImg3").value = "";

    alert("Producto guardado con éxito.");
  } catch (err) {
    alert("Error al guardar producto: " + err.message);
  }
};

window.eliminarProductoAdmin = async function(premioId) {
  if (confirm("¿Estás seguro de que deseas eliminar este producto?")) {
    try {
      await deleteDoc(doc(db, "productos", premioId));
      alert("Producto eliminado del sistema.");
    } catch (err) {
      alert("Error al eliminar producto: " + err.message);
    }
  }
};

function renderizarListaProductosAdmin() {
  const container = document.getElementById("adminListaProductosGrid");
  if (!container) return;

  container.innerHTML = "";
  if (listaProductosDB.length === 0) {
    container.innerHTML = "<p style='color:#666;'>No hay productos en el catálogo.</p>";
    return;
  }

  listaProductosDB.forEach(p => {
    container.innerHTML += `
      <div class="admin-product-item">
        <div class="admin-product-info">
          <img src="${p.imgs[0]}" alt="${p.nombre}">
          <div>
            <strong>${p.nombre}</strong><br>
            <small style="color: #666;">Mínimo: $${p.monto.toLocaleString()} | Imágenes: ${p.imgs.length}</small>
          </div>
        </div>
        <button class="btn-delete-prod" onclick="eliminarProductoAdmin('${p.id}')">
          <i class="fa-solid fa-trash"></i> Eliminar
        </button>
      </div>
    `;
  });
}

// 3. POP-UP PROMOCIONAL CLIENTES
async function verificarPopUpPromo() {
  try {
    const promoDoc = await getDoc(doc(db, "configuracion", "popup"));
    if (promoDoc.exists()) {
      const data = promoDoc.data();
      if (data.activo) {
        document.getElementById("promoTitle").innerText = data.titulo || "¡Promoción!";
        document.getElementById("promoImage").src = data.imagen || "";
        document.getElementById("promoText").innerText = data.texto || "";
        window.toggleModal("modalPopUpPromo");
      }

      document.getElementById("checkPopUpActive").checked = data.activo || false;
      document.getElementById("popupTitleAdmin").value = data.titulo || "";
      document.getElementById("popupImgAdmin").value = data.imagen || "";
      document.getElementById("popupTextAdmin").value = data.texto || "";
    }
  } catch (err) {
    console.error("Error cargando popup:", err);
  }
}

window.guardarPopUpAdmin = async function() {
  const activo = document.getElementById("checkPopUpActive").checked;
  const titulo = document.getElementById("popupTitleAdmin").value;
  const imagen = document.getElementById("popupImgAdmin").value;
  const texto = document.getElementById("popupTextAdmin").value;

  try {
    await setDoc(doc(db, "configuracion", "popup"), { activo, titulo, imagen, texto });
    alert("Configuración de Pop-up guardada con éxito.");
  } catch (err) {
    alert("Error al guardar pop-up: " + err.message);
  }
};

window.eliminarPopUpAdmin = async function() {
  if (confirm("¿Deseas eliminar la configuración del Pop-up promocional?")) {
    try {
      await deleteDoc(doc(db, "configuracion", "popup"));
      document.getElementById("checkPopUpActive").checked = false;
      document.getElementById("popupTitleAdmin").value = "";
      document.getElementById("popupImgAdmin").value = "";
      document.getElementById("popupTextAdmin").value = "";
      alert("Pop-up eliminado.");
    } catch (err) {
      alert("Error al eliminar pop-up: " + err.message);
    }
  }
};

// 4. RESERVA CON ENVÍO AL APPS SCRIPT/TELEGRAM/PLANILHA
window.confirmarReservaFirebase = async function() {
  const premioId = document.getElementById("inputPremioIdSeleccionado").value;
  const numero = document.getElementById("inputNumeroSeleccionado").value;

  if (!numero) { alert("Por favor selecciona un número."); return; }
  if (!currentUserData || currentUserData.ticketsDisponibles < 1) { alert("No tienes suficientes tickets."); return; }

  const docIdReserva = `${premioId}_${numero}`;
  const docRef = doc(db, "reservas", docIdReserva);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) { alert("El número ya fue tomado por otro usuario."); return; }

  try {
    await updateDoc(doc(db, "usuarios", currentUser.uid), { ticketsDisponibles: increment(-1) });
    const premio = listaProductosDB.find(p => p.id === premioId);
    
    await setDoc(docRef, {
      usuarioId: currentUser.uid,
      nombreUsuario: currentUserData.nombreUsuario,
      premioId: premioId,
      premioNombre: premio ? premio.nombre : "Sorteo",
      numero: numero,
      fecha: new Date().toISOString()
    });

    // ENVÍO TRANSPARENTE AL GOOGLE APPS SCRIPT -> TELEGRAM & GOOGLE SHEETS
    fetch(APPS_SCRIPT_URL, {
      method: "POST", 
      mode: "no-cors", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "reservar_numero", 
        usuario: currentUserData.nombreUsuario, 
        premioId: premio ? premio.nombre : premioId, 
        numero: numero 
      })
    }).catch(e => console.log("Apps Script trigger enviado."));

    alert(`¡Éxito! Número #${numero} reservado.`);
    await cargarDatosUsuario(currentUser.uid);
    window.toggleModal("modalNumeros");
  } catch (err) { alert("Error: " + err.message); }
};

// RESTO DE FUNCIONALIDADES E ATRIBUÇÃO DE TICKETS
window.agregarTicketsUsuarioAdmin = async function() {
  const emailInput = document.getElementById("adminUserEmail").value.trim();
  const amountInput = parseInt(document.getElementById("adminTicketAmount").value);

  if (!emailInput || isNaN(amountInput) || amountInput <= 0) {
    alert("Por favor ingresa un correo válido y una cantidad mayor a 0.");
    return;
  }

  try {
    const q = query(collection(db, "usuarios"), where("email", "==", emailInput));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      alert("No se encontró ningún usuario registrado con el correo: " + emailInput);
      return;
    }

    let targetUid = null;
    querySnapshot.forEach(docSnap => targetUid = docSnap.id);

    await updateDoc(doc(db, "usuarios", targetUid), {
      ticketsDisponibles: increment(amountInput),
      ticketsSemanales: increment(amountInput)
    });

    alert(`¡Éxito! Se han agregado ${amountInput} tickets al usuario.`);
    document.getElementById("adminUserEmail").value = "";
    document.getElementById("adminTicketAmount").value = "";
  } catch (err) {
    alert("Error al transferir tickets: " + err.message);
  }
};

window.buscarUsuarioAdmin = async function() {
  const queryText = document.getElementById("inputBusquedaAdmin").value.toLowerCase().trim();
  const resBox = document.getElementById("resultadosBusquedaAdmin");
  
  if (queryText.length < 2) { resBox.innerHTML = ""; return; }

  const snapshot = await getDocs(collection(db, "usuarios"));
  resBox.innerHTML = "";

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if ((data.nombreUsuario && data.nombreUsuario.toLowerCase().includes(queryText)) || 
        (data.email && data.email.toLowerCase().includes(queryText))) {
      
      resBox.innerHTML += `
        <div style="background:#fff; border:1px solid #e9ecef; padding:12px; border-radius:6px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${data.nombreUsuario}</strong> (${data.email})<br>
            <small>Tickets Disponibles: <strong class="highlight-yellow">${data.ticketsDisponibles || 0}</strong></small>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary" style="padding:6px 10px; font-size:12px;" onclick="cargarTicketsRapido('${data.email}')">
              <i class="fa-solid fa-plus"></i> Cargar Tickets
            </button>
            <button class="btn-admin-panel" style="padding:6px 10px; font-size:12px;" onclick="verPerfilUsuarioAdmin('${docSnap.id}')">
              <i class="fa-solid fa-eye"></i> Ver Perfil
            </button>
          </div>
        </div>
      `;
    }
  });
};

window.cargarTicketsRapido = function(email) {
  switchAdminTab('usuarios');
  document.getElementById("adminUserEmail").value = email;
};

window.verPerfilUsuarioAdmin = async function(uid) {
  const userDoc = await getDoc(doc(db, "usuarios", uid));
  if (!userDoc.exists()) return;
  const uData = userDoc.data();

  document.getElementById("adminUserProfileName").innerText = uData.nombreUsuario || "Usuario";
  document.getElementById("adminUserProfileEmail").innerText = uData.email || "";
  document.getElementById("adminUserProfileTickets").innerText = uData.ticketsDisponibles || 0;
  document.getElementById("adminUserProfileWeeklyTickets").innerText = uData.ticketsSemanales || 0;

  const q = query(collection(db, "reservas"), where("usuarioId", "==", uid));
  const snapReservas = await getDocs(q);
  const tableBody = document.getElementById("adminUserProfileBetsTable");
  tableBody.innerHTML = "";

  if (snapReservas.empty) {
    tableBody.innerHTML = "<tr><td colspan='3'>Sin apostas registradas.</td></tr>";
  } else {
    snapReservas.forEach(docSnap => {
      const res = docSnap.data();
      tableBody.innerHTML += `
        <tr>
          <td>${res.premioNombre}</td>
          <td>#${res.numero}</td>
          <td>${new Date(res.fecha).toLocaleString()}</td>
        </tr>
      `;
    });
  }

  window.toggleModal("modalUserProfileAdmin");
};

// USER PANEL TAB SWITCH
window.switchUserTab = function(tabName) {
  document.querySelectorAll(".user-tab-pane").forEach(pane => pane.classList.remove("active"));
  document.querySelectorAll("#modalUserFullscreen .admin-nav-item").forEach(item => item.classList.remove("active"));

  const targetPane = document.getElementById(`userTab-${tabName}`);
  if (targetPane) targetPane.classList.add("active");

  if (tabName === 'sorteos-activos') {
    document.getElementById("userActiveSorteosGrid").innerHTML = document.getElementById("gridProductos").innerHTML;
  } else if (tabName === 'sorteos-participando' || tabName === 'historial-numeros') {
    cargarHistorialUsuario();
  }
};

async function cargarHistorialUsuario() {
  if (!currentUser) return;
  const q = query(collection(db, "reservas"), where("usuarioId", "==", currentUser.uid));
  const snap = await getDocs(q);

  const tableBody = document.getElementById("userNumbersTable");
  const participatingList = document.getElementById("userParticipatingList");
  tableBody.innerHTML = "";
  participatingList.innerHTML = "";

  if (snap.empty) {
    tableBody.innerHTML = "<tr><td colspan='3'>No has reservado números aún.</td></tr>";
    participatingList.innerHTML = "<p>No estás participando en ningún sorteo activo.</p>";
    return;
  }

  const premiosParticipando = new Set();

  snap.forEach(docSnap => {
    const data = docSnap.data();
    premiosParticipando.add(data.premioNombre);

    tableBody.innerHTML += `
      <tr>
        <td>${data.premioNombre}</td>
        <td>#${data.numero}</td>
        <td>${new Date(data.fecha).toLocaleString()}</td>
      </tr>
    `;
  });

  premiosParticipando.forEach(premioNombre => {
    participatingList.innerHTML += `
      <div style="background:#f8f9fa; border:1px solid #e9ecef; padding:12px; border-radius:6px; margin-bottom:10px;">
        <i class="fa-solid fa-trophy" style="color:var(--accent-yellow);"></i> <strong>${premioNombre}</strong>
      </div>
    `;
  });
}

// LOGINS
window.registroFirebase = async function() {
  const user = document.getElementById("regUsuario").value;
  const email = document.getElementById("regEmail").value;
  const pass = document.getElementById("regPass").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "usuarios", cred.user.uid), { 
      nombreUsuario: user, email: email, ticketsDisponibles: 0, ticketsSemanales: 0, rol: "user" 
    });
    alert("Cuenta creada con éxito."); window.toggleModal("modalLogin");
  } catch (err) { alert(err.message); }
};

window.loginFirebase = async function() {
  try {
    await signInWithEmailAndPassword(auth, document.getElementById("loginEmail").value, document.getElementById("loginPass").value);
    window.toggleModal("modalLogin");
  } catch (err) { alert(err.message); }
};

window.logoutFirebase = function() { 
  signOut(auth); 
  const modalU = document.getElementById("modalUserFullscreen");
  if (modalU) modalU.style.display = "none";
};

async function cargarDatosUsuario(uid) {
  const userDoc = await getDoc(doc(db, "usuarios", uid));
  if (userDoc.exists()) {
    currentUserData = userDoc.data();
    
    document.getElementById("userPanelSub").innerText = currentUserData.nombreUsuario;
    document.getElementById("uPerfName").innerText = currentUserData.nombreUsuario;
    document.getElementById("uPerfEmail").innerText = currentUserData.email;
    document.getElementById("uPerfTickets").innerText = currentUserData.ticketsDisponibles || 0;

    if (currentUserData.rol === "admin") {
      document.getElementById("adminTriggerFromUser").style.display = "block";
    }
  }
}

function actualizarInterfazUsuarioLogueado() {
  document.getElementById("userAuthArea").innerHTML = `
    <button class="btn-login" onclick="toggleModal('modalUserFullscreen')">
      <i class="fa-solid fa-user-check"></i> ${currentUserData ? currentUserData.nombreUsuario : 'Mi Cuenta'}
    </button>
  `;
}

function actualizarInterfazDeslogueado() {
  document.getElementById("userAuthArea").innerHTML = `
    <button class="btn-login" onclick="toggleModal('modalLogin')">
      <i class="fa-solid fa-user"></i> Ingresar
    </button>
  `;
}

window.abrirModalNumeros = async function(premioId) {
  if (!currentUser) {
    alert("Debes iniciar sesión para elegir un número.");
    window.toggleModal("modalLogin");
    return;
  }

  const premio = listaProductosDB.find(p => p.id === premioId);
  if (!premio) return;

  document.getElementById("modalPremioTitulo").innerText = premio.nombre;
  document.getElementById("modalPremioMonto").innerText = `$${premio.monto.toLocaleString()}`;
  document.getElementById("inputPremioIdSeleccionado").value = premioId;
  document.getElementById("modalUserTickets").innerText = currentUserData ? currentUserData.ticketsDisponibles : 0;

  const imgPrincipal = document.getElementById("modalPremioImgPrincipal");
  imgPrincipal.src = premio.imgs[0];
  const miniaturasContainer = document.getElementById("modalPremioMiniaturas");
  miniaturasContainer.innerHTML = "";

  if (premio.imgs.length > 1) {
    premio.imgs.forEach((url, index) => {
      miniaturasContainer.innerHTML += `<img src="${url}" class="thumb-img ${index === 0 ? 'active' : ''}" onclick="trocarImagemPrincipal('${url}', this)">`;
    });
  }

  const grid = document.getElementById("gridNumeros");
  grid.innerHTML = "Cargando números...";

  const q = query(collection(db, "reservas"), where("premioId", "==", premioId));
  const querySnapshot = await getDocs(q);
  const ocupadosSet = new Set();
  querySnapshot.forEach(docSnap => ocupadosSet.add(docSnap.data().numero));

  grid.innerHTML = "";
  for (let i = 1; i <= 500; i++) {
    const numPadded = String(i).padStart(3, '0');
    const isOcupado = ocupadosSet.has(numPadded);
    const claseStatus = isOcupado ? "ocupado" : "disponible";

    grid.innerHTML += `
      <div class="num-node ${claseStatus}" id="numNode_${numPadded}" onclick="seleccionarNumeroNodo('${numPadded}', ${isOcupado})">
        ${numPadded}
      </div>
    `;
  }

  window.toggleModal("modalNumeros");
};

window.trocarImagemPrincipal = function(url, elemento) {
  document.getElementById("modalPremioImgPrincipal").src = url;
  document.querySelectorAll(".thumb-img").forEach(el => el.classList.remove("active"));
  elemento.classList.add("active");
};

window.seleccionarNumeroNodo = function(numero, isOcupado) {
  if (isOcupado) return;
  document.querySelectorAll(".num-node").forEach(n => n.classList.remove("selected"));
  document.getElementById(`numNode_${numero}`).classList.add("selected");
  document.getElementById("inputNumeroSeleccionado").value = numero;
};

window.switchAdminTab = function(tabName) {
  document.querySelectorAll(".admin-tab-pane").forEach(pane => pane.classList.remove("active"));
  document.querySelectorAll(".admin-nav-item").forEach(item => item.classList.remove("active"));

  const targetPane = document.getElementById(`adminTab-${tabName}`);
  if (targetPane) targetPane.classList.add("active");

  if (tabName === 'productos') {
    renderizarListaProductosAdmin();
  } else if (tabName === 'sorteos' || tabName === 'historico') {
    poblarSelectSorteos();
  }
};

function poblarSelectSorteos() {
  const sel1 = document.getElementById("selectSorteoElegir");
  const sel2 = document.getElementById("selectHistoricoPremio");
  if (sel1) sel1.innerHTML = ""; 
  if (sel2) sel2.innerHTML = "";

  listaProductosDB.forEach(p => {
    if (sel1) sel1.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
    if (sel2) sel2.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
  });
}

window.ejecutarSorteoAdmin = async function() {
  const premioId = document.getElementById("selectSorteoElegir").value;
  const q = query(collection(db, "reservas"), where("premioId", "==", premioId));
  const snapshot = await getDocs(q);

  if (snapshot.empty) { alert("No hay reservas para este sorteo."); return; }

  const reservas = [];
  snapshot.forEach(docSnap => reservas.push(docSnap.data()));

  const ganadorIndex = Math.floor(Math.random() * reservas.length);
  const ganador = reservas[ganadorIndex];

  document.getElementById("resultadoGanador").innerHTML = `
    <h3>🎉 ¡GANADOR SELECCIONADO!</h3>
    <p>Usuario: <strong>${ganador.nombreUsuario}</strong></p>
    <p>Número Afortunado: <strong>#${ganador.numero}</strong></p>
  `;
};

window.cargarHistoricoPremioAdmin = async function(premioId) {
  const tbody = document.getElementById("tableBodyHistorico");
  tbody.innerHTML = "Cargando...";

  const q = query(collection(db, "reservas"), where("premioId", "==", premioId));
  const snapshot = await getDocs(q);

  tbody.innerHTML = "";
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    tbody.innerHTML += `
      <tr>
        <td>#${data.numero}</td>
        <td>${data.nombreUsuario}</td>
        <td>${new Date(data.fecha).toLocaleString()}</td>
      </tr>
    `;
  });
};

window.toggleModal = function(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = (modal.style.display === "flex" || modal.style.display === "block") ? "none" : "flex";
};

window.switchAuthTab = function(tab) {
  document.getElementById("tabIngresar").classList.toggle("active", tab === 'login');
  document.getElementById("tabRegistro").classList.toggle("active", tab === 'registro');
  document.getElementById("formLogin").style.display = tab === 'login' ? "flex" : "none";
  document.getElementById("formRegistro").style.display = tab === 'registro' ? "flex" : "none";
};
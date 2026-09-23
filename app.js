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

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxajf27Q6b13NfQcL-70qUpADmUMvTF9knL50qi-sNrAmdhbKuGGBNQT6ZUed3bzIFK/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = null;
let currentBanners = [];
let listaProductosDB = [];
let listaUsuariosDB = [];

// RANGOS VIP
const VIP_RANKS = {
  1: { name: "Bronce", class: "vip-1" },
  2: { name: "Plata", class: "vip-2" },
  3: { name: "Oro", class: "vip-3" },
  4: { name: "Platino", class: "vip-4" },
  5: { name: "Maestro", class: "vip-5" }
};

function getVipBadgeHtml(level) {
  const rank = VIP_RANKS[level] || VIP_RANKS[1];
  return `<span class="vip-badge ${rank.class}">${rank.name}</span>`;
}

// PINES DEL DADO CON ICONOS
const DICE_ICONS = {
  1: '<i class="fa-solid fa-dice-one"></i>',
  2: '<i class="fa-solid fa-dice-two"></i>',
  3: '<i class="fa-solid fa-dice-three"></i>',
  4: '<i class="fa-solid fa-dice-four"></i>',
  5: '<i class="fa-solid fa-dice-five"></i>',
  6: '<i class="fa-solid fa-dice-six"></i>',
  '?': '<i class="fa-solid fa-dice"></i>'
};

// REGRAS PADRÃO VIP DE EVOLUÇÃO
let vipConfig = { reqL2: 5, reqL3: 15, reqL4: 30, reqL5: 50 };
let cronometroInterval = null;

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
  cargarConfigVip();
  verificarPopUpPromo();
  iniciarCronometros();
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

// CRONÓMETRO EN TIEMPO REAL
function iniciarCronometros() {
  if (cronometroInterval) clearInterval(cronometroInterval);
  cronometroInterval = setInterval(actualizarCronometrosDisplays, 1000);
  actualizarCronometrosDisplays();
}

function actualizarCronometrosDisplays() {
  const elementos = document.querySelectorAll("[data-cronometro-target]");
  const ahora = new Date().getTime();

  elementos.forEach(el => {
    const targetStr = el.getAttribute("data-cronometro-target");
    if (!targetStr) {
      el.innerHTML = `<i class="fa-solid fa-clock"></i> Por definir`;
      return;
    }

    const targetDate = new Date(targetStr).getTime();
    if (isNaN(targetDate)) {
      el.innerHTML = `<i class="fa-solid fa-clock"></i> Por definir`;
      return;
    }

    const diff = targetDate - ahora;
    if (diff <= 0) {
      el.innerHTML = `<i class="fa-solid fa-flag-checkered"></i> ¡Sorteo en curso!`;
      return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diff % (1000 * 60)) / 1000);

    let texto = "";
    if (dias > 0) {
      texto = `${dias}d ${horas.toString().padStart(2, '0')}h ${minutos.toString().padStart(2, '0')}m ${segundos.toString().padStart(2, '0')}s`;
    } else {
      texto = `${horas.toString().padStart(2, '0')}h ${minutos.toString().padStart(2, '0')}m ${segundos.toString().padStart(2, '0')}s`;
    }

    el.innerHTML = `<i class="fa-solid fa-stopwatch"></i> ${texto}`;
  });
}

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
        "https://via.placeholder.com/1920x1080/111/ffc107?text=CARGA+10.000+Y+CONSIGUE+TU+TICKET+GRATIS",
        "https://via.placeholder.com/1920x1080/004085/ffffff?text=GRANDES+PREMIOS+EN+EFECTIVO+Y+TECNOLOGIA"
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

    renderizarBannersAdmin();
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

function renderizarBannersAdmin() {
  const container = document.getElementById("adminBannersList");
  if (!container) return;
  container.innerHTML = "";

  currentBanners.forEach((url, index) => {
    container.innerHTML += `
      <div class="admin-banner-card">
        <img src="${url}" alt="Banner ${index + 1}">
        <p style="font-size:11px; color:#666; word-break:break-all; margin: 8px 0;">${url}</p>
        <button class="btn-delete-prod" style="width:100%;" onclick="eliminarBannerAdmin(${index})">
          <i class="fa-solid fa-trash"></i> Eliminar Banner
        </button>
      </div>
    `;
  });
}

window.agregarBannerAdmin = async function() {
  const inputUrl = document.getElementById("newBannerUrlInput").value.trim();
  if (!inputUrl) { alert("Ingresa la URL del banner."); return; }

  const newList = [...currentBanners, inputUrl];
  try {
    await setDoc(doc(db, "configuracion", "banners"), { list: newList });
    document.getElementById("newBannerUrlInput").value = "";
    alert("Banner agregado correctamente.");
  } catch (err) { alert("Error: " + err.message); }
};

window.eliminarBannerAdmin = async function(index) {
  if (confirm("¿Deseas eliminar este banner?")) {
    const newList = currentBanners.filter((_, idx) => idx !== index);
    try {
      await setDoc(doc(db, "configuracion", "banners"), { list: newList });
      alert("Banner eliminado.");
    } catch (err) { alert("Error: " + err.message); }
  }
};

// 2. PRODUCTOS COMPLETO CON EDICIÓN, IMÁGENES 800x800 Y CRONÓMETRO
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

      const imgCat = p.imgCatalog || (p.imgs && p.imgs[0]) || '';
      const reqVip = p.nivelVipMinimo || 1;

      const cardHtml = `
        <div class="card-producto">
          <div class="card-img-container">
            <span class="badge-cronograma" data-cronometro-target="${p.fechaSorteo || ''}">
              <i class="fa-solid fa-clock"></i> Cargando...
            </span>
            <img src="${imgCat}" alt="${p.nombre}">
          </div>
          <div class="card-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
              <h3 class="producto-titulo" style="margin:0;">${p.nombre}</h3>
              ${getVipBadgeHtml(reqVip)}
            </div>
            <div class="producto-precio-info"><span class="carga-minima">Mínimo de carga: <strong>$${p.monto.toLocaleString()}</strong></span></div>
            <div class="tickets-progress-container" style="margin-top:10px;">
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
      actualizarCronometrosDisplays();
    });
  });
}

// GUARDAR / EDITAR PRODUCTO EN ADMIN
window.guardarProductoAdmin = async function() {
  const editingId = document.getElementById("editingProductId").value;
  const name = document.getElementById("newProdName").value.trim();
  const price = parseInt(document.getElementById("newProdPrice").value);
  const fecha = document.getElementById("newProdFecha").value;
  const vipReq = parseInt(document.getElementById("newProdVipReq").value) || 1;
  const imgCat = document.getElementById("newProdImgCatalog").value.trim();
  const img1 = document.getElementById("newProdImg1").value.trim();
  const img2 = document.getElementById("newProdImg2").value.trim();
  const img3 = document.getElementById("newProdImg3").value.trim();
  const img4 = document.getElementById("newProdImg4").value.trim();

  if (!name || isNaN(price) || !imgCat || !img1) { 
    alert("Ingresa nombre, precio, imagen de catálogo (800x800) e imagen principal."); 
    return; 
  }

  const imgsArr = [img1, img2, img3, img4].filter(url => url !== "");
  const targetId = editingId || `premio_${Date.now()}`;

  try {
    await setDoc(doc(db, "productos", targetId), {
      nombre: name,
      monto: price,
      fechaSorteo: fecha || new Date().toISOString(),
      nivelVipMinimo: vipReq,
      imgCatalog: imgCat,
      imgs: imgsArr,
      fechaCreacion: new Date().toISOString()
    }, { merge: true });

    cancelarEdicionProductoAdmin();
    alert(editingId ? "Producto actualizado con éxito." : "Producto guardado con éxito.");
  } catch (err) { alert("Error: " + err.message); }
};

window.cargarEdicionProductoAdmin = function(premioId) {
  const p = listaProductosDB.find(item => item.id === premioId);
  if (!p) return;

  document.getElementById("editingProductId").value = p.id;
  document.getElementById("adminFormProdTitle").innerText = `Editar Producto: ${p.nombre}`;
  document.getElementById("newProdName").value = p.nombre || "";
  document.getElementById("newProdPrice").value = p.monto || 0;
  document.getElementById("newProdFecha").value = p.fechaSorteo || "";
  document.getElementById("newProdVipReq").value = p.nivelVipMinimo || 1;
  document.getElementById("newProdImgCatalog").value = p.imgCatalog || "";
  
  const imgs = p.imgs || [];
  document.getElementById("newProdImg1").value = imgs[0] || "";
  document.getElementById("newProdImg2").value = imgs[1] || "";
  document.getElementById("newProdImg3").value = imgs[2] || "";
  document.getElementById("newProdImg4").value = imgs[3] || "";

  document.getElementById("btnSaveProduct").innerText = "Actualizar Producto";
  document.getElementById("btnCancelEditProduct").style.display = "inline-block";
};

window.cancelarEdicionProductoAdmin = function() {
  document.getElementById("editingProductId").value = "";
  document.getElementById("adminFormProdTitle").innerText = "Agregar Nuevo Producto";
  document.getElementById("newProdName").value = "";
  document.getElementById("newProdPrice").value = "";
  document.getElementById("newProdFecha").value = "";
  document.getElementById("newProdVipReq").value = "1";
  document.getElementById("newProdImgCatalog").value = "";
  document.getElementById("newProdImg1").value = "";
  document.getElementById("newProdImg2").value = "";
  document.getElementById("newProdImg3").value = "";
  document.getElementById("newProdImg4").value = "";

  document.getElementById("btnSaveProduct").innerText = "Guardar Producto";
  document.getElementById("btnCancelEditProduct").style.display = "none";
};

window.eliminarProductoAdmin = async function(premioId) {
  if (confirm("¿Estás seguro de que deseas eliminar este producto?")) {
    try {
      await deleteDoc(doc(db, "productos", premioId));
      alert("Producto eliminado del sistema.");
    } catch (err) { alert("Error: " + err.message); }
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
    const fechaFmt = p.fechaSorteo ? new Date(p.fechaSorteo).toLocaleString('es-AR') : 'Sin fecha';
    container.innerHTML += `
      <div class="admin-product-item">
        <div class="admin-product-info">
          <img src="${p.imgCatalog || (p.imgs && p.imgs[0])}" alt="${p.nombre}">
          <div>
            <strong>${p.nombre}</strong> ${getVipBadgeHtml(p.nivelVipMinimo || 1)}<br>
            <small style="color: #666;">Mínimo: $${p.monto ? p.monto.toLocaleString() : 0} | Cronograma: ${fechaFmt}</small>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-edit-prod" onclick="cargarEdicionProductoAdmin('${p.id}')">
            <i class="fa-solid fa-pen"></i> Editar
          </button>
          <button class="btn-delete-prod" onclick="eliminarProductoAdmin('${p.id}')">
            <i class="fa-solid fa-trash"></i> Eliminar
          </button>
        </div>
      </div>
    `;
  });
}

// 3. MINIJUEGO DE DADO CASHBACK CON PINES Y ANIMACIÓN
window.abrirMinijuegoDados = function() {
  if (!currentUser) {
    alert("Por favor inicia sesión para ingresar al Minijuego del Dado.");
    window.toggleModal("modalLogin");
    return;
  }
  
  document.getElementById("diceUserChances").innerText = currentUserData ? (currentUserData.tiradasDados || 0) : 0;
  document.getElementById("diceGameResultBox").style.display = "none";
  document.getElementById("diceVisualDisplay").innerHTML = DICE_ICONS['?'];
  window.toggleModal("modalMinijuegoDados");
};

window.tirarDadoCashback = async function() {
  if (!currentUserData || (currentUserData.tiradasDados || 0) < 1) {
    alert("No tienes tiradas disponibles para el juego del dado.");
    return;
  }

  const btnRoll = document.getElementById("btnRollDice");
  const display = document.getElementById("diceVisualDisplay");
  const resultBox = document.getElementById("diceGameResultBox");
  
  btnRoll.disabled = true;
  resultBox.style.display = "none";
  display.classList.add("dice-rolling");

  let counter = 0;
  let interval = setInterval(() => {
    const randomTemp = Math.floor(Math.random() * 6) + 1;
    display.innerHTML = DICE_ICONS[randomTemp];
    counter++;
  }, 80);

  setTimeout(async () => {
    clearInterval(interval);
    display.classList.remove("dice-rolling");

    const randPercent = Math.random();
    let finalNumber = 1;

    if (randPercent < 0.10) {
      finalNumber = 6;
    } else {
      finalNumber = Math.floor(Math.random() * 5) + 1;
    }

    display.innerHTML = DICE_ICONS[finalNumber];

    try {
      await updateDoc(doc(db, "usuarios", currentUser.uid), {
        tiradasDados: increment(-1)
      });
      await cargarDatosUsuario(currentUser.uid);
      document.getElementById("diceUserChances").innerText = currentUserData.tiradasDados || 0;

      if (finalNumber === 6) {
        display.classList.add("dice-win-bounce");
        setTimeout(() => display.classList.remove("dice-win-bounce"), 1000);

        resultBox.style.background = "rgba(40, 167, 69, 0.2)";
        resultBox.style.border = "1px solid #28a745";
        resultBox.style.color = "#28a745";
        resultBox.innerHTML = `🎉 ¡FELICITACIONES! Obtuviste un 6 (seis pines) y ganaste 100% de Cash Back de tu depósito elegible. Contacta al soporte para acreditar tu bono.`;

        fetch(APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ganador_dado_cashback",
            usuario: currentUserData.nombreUsuario,
            email: currentUserData.email,
            premio: "100% CASHBACK BONO DADO"
          })
        }).catch(e => console.log("Notificación Apps Script enviada."));

      } else {
        resultBox.style.background = "rgba(220, 53, 69, 0.2)";
        resultBox.style.border = "1px solid #dc3545";
        resultBox.style.color = "#dc3545";
        resultBox.innerHTML = `Obtuviste ${finalNumber} pines. No salió el 6 esta vez. ¡Inténtalo de nuevo en tu próxima recarga!`;
      }

      resultBox.style.display = "block";
    } catch (err) {
      alert("Error actualizando tirada: " + err.message);
    } finally {
      btnRoll.disabled = false;
    }
  }, 2200);
};

// 4. EVOLUCIÓN VIP Y CONFIGURACIÓN
async function cargarConfigVip() {
  try {
    const docSnap = await getDoc(doc(db, "configuracion", "vip"));
    if (docSnap.exists()) {
      vipConfig = docSnap.data();
      document.getElementById("vipReqLevel2").value = vipConfig.reqL2 || 5;
      document.getElementById("vipReqLevel3").value = vipConfig.reqL3 || 15;
      document.getElementById("vipReqLevel4").value = vipConfig.reqL4 || 30;
      document.getElementById("vipReqLevel5").value = vipConfig.reqL5 || 50;
    }
  } catch (e) { console.log("Config VIP cargada por defecto."); }
}

window.guardarConfigVipAdmin = async function() {
  const reqL2 = parseInt(document.getElementById("vipReqLevel2").value);
  const reqL3 = parseInt(document.getElementById("vipReqLevel3").value);
  const reqL4 = parseInt(document.getElementById("vipReqLevel4").value);
  const reqL5 = parseInt(document.getElementById("vipReqLevel5").value);

  vipConfig = { reqL2, reqL3, reqL4, reqL5 };
  try {
    await setDoc(doc(db, "configuracion", "vip"), vipConfig);
    alert("Reglas de Evolución VIP guardadas correctamente.");
  } catch (e) { alert("Error: " + e.message); }
};

function calcularNivelVip(ticketsUsados) {
  if (ticketsUsados >= (vipConfig.reqL5 || 50)) return 5;
  if (ticketsUsados >= (vipConfig.reqL4 || 30)) return 4;
  if (ticketsUsados >= (vipConfig.reqL3 || 15)) return 3;
  if (ticketsUsados >= (vipConfig.reqL2 || 5)) return 2;
  return 1;
}

// 5. LISTA DE USUARIOS
function cargarListaUsuariosAdmin() {
  onSnapshot(collection(db, "usuarios"), (snapshot) => {
    listaUsuariosDB = [];
    snapshot.forEach(docSnap => {
      listaUsuariosDB.push({ uid: docSnap.id, ...docSnap.data() });
    });
    
    listaUsuariosDB.sort((a, b) => (a.nombreUsuario || '').localeCompare(b.nombreUsuario || ''));
    renderizarUsuariosAdmin();
  });
}

window.renderizarUsuariosAdmin = function() {
  const tbody = document.getElementById("adminUsersTableBody");
  const filterVip = document.getElementById("filterUserVipAdmin").value;
  const searchTxt = document.getElementById("inputSearchUserListAdmin").value.toLowerCase().trim();
  
  if (!tbody) return;
  tbody.innerHTML = "";

  const filtrados = listaUsuariosDB.filter(u => {
    const userVip = u.nivelVip || 1;
    const matchVip = (filterVip === "all") || (userVip.toString() === filterVip);
    const matchText = (u.nombreUsuario && u.nombreUsuario.toLowerCase().includes(searchTxt)) ||
                      (u.email && u.email.toLowerCase().includes(searchTxt));
    return matchVip && matchText;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5'>No se encontraron usuarios.</td></tr>";
    return;
  }

  filtrados.forEach(u => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${u.nombreUsuario || 'Usuario'}</strong><br><small style="color:#666;">${u.email}</small></td>
        <td>${getVipBadgeHtml(u.nivelVip || 1)}</td>
        <td><strong class="highlight-yellow">${u.ticketsDisponibles || 0}</strong></td>
        <td><strong>${u.tiradasDados || 0}</strong></td>
        <td>
          <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick="verPerfilUsuarioAdmin('${u.uid}')">
            <i class="fa-solid fa-pen"></i> Gestionar
          </button>
        </td>
      </tr>
    `;
  });
};

window.verPerfilUsuarioAdmin = async function(uid) {
  const userDoc = await getDoc(doc(db, "usuarios", uid));
  if (!userDoc.exists()) return;
  const uData = userDoc.data();

  document.getElementById("adminEditUserUid").value = uid;
  document.getElementById("adminUserProfileName").innerText = uData.nombreUsuario || "Usuario";
  document.getElementById("adminUserProfileEmail").innerText = uData.email || "";
  document.getElementById("adminEditUserVip").value = uData.nivelVip || 1;
  document.getElementById("adminEditUserTicketsAdd").value = 0;
  document.getElementById("adminEditUserDiceAdd").value = 0;

  const q = query(collection(db, "reservas"), where("usuarioId", "==", uid));
  const snapReservas = await getDocs(q);
  const tableBody = document.getElementById("adminUserProfileBetsTable");
  tableBody.innerHTML = "";

  if (snapReservas.empty) {
    tableBody.innerHTML = "<tr><td colspan='3'>Sin reservas registradas.</td></tr>";
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

window.guardarCambiosUsuarioAdmin = async function() {
  const uid = document.getElementById("adminEditUserUid").value;
  const newVip = parseInt(document.getElementById("adminEditUserVip").value);
  const ticketsAdd = parseInt(document.getElementById("adminEditUserTicketsAdd").value) || 0;
  const diceAdd = parseInt(document.getElementById("adminEditUserDiceAdd").value) || 0;

  try {
    await updateDoc(doc(db, "usuarios", uid), {
      nivelVip: newVip,
      ticketsDisponibles: increment(ticketsAdd),
      tiradasDados: increment(diceAdd)
    });

    alert("Datos de usuario actualizados correctamente.");
    window.toggleModal("modalUserProfileAdmin");
  } catch (err) { alert("Error: " + err.message); }
};

// 6. BÚSQUEDA RÁPIDA DE USUARIOS FUNCIONAL
window.buscarUsuarioAdmin = function() {
  const queryText = document.getElementById("inputBusquedaAdmin").value.toLowerCase().trim();
  const container = document.getElementById("resultadosBusquedaAdmin");
  if (!container) return;

  if (!queryText) {
    container.innerHTML = "<p style='color:#666;'>Ingresa un término para buscar.</p>";
    return;
  }

  const resultados = listaUsuariosDB.filter(u => 
    (u.nombreUsuario && u.nombreUsuario.toLowerCase().includes(queryText)) ||
    (u.email && u.email.toLowerCase().includes(queryText))
  );

  if (resultados.length === 0) {
    container.innerHTML = "<p style='color:#dc3545;'>No se encontraron usuarios.</p>";
    return;
  }

  let html = `<div class="table-container"><table class="admin-table">
    <thead>
      <tr>
        <th>Usuario / Email</th>
        <th>Rango VIP</th>
        <th>Tickets</th>
        <th>Chances Dado</th>
        <th>Acción</th>
      </tr>
    </thead><tbody>`;

  resultados.forEach(u => {
    html += `
      <tr>
        <td><strong>${u.nombreUsuario || 'Usuario'}</strong><br><small style="color:#666;">${u.email}</small></td>
        <td>${getVipBadgeHtml(u.nivelVip || 1)}</td>
        <td><strong class="highlight-yellow">${u.ticketsDisponibles || 0}</strong></td>
        <td><strong>${u.tiradasDados || 0}</strong></td>
        <td>
          <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="verPerfilUsuarioAdmin('${u.uid}')">
            <i class="fa-solid fa-user-pen"></i> Editar Perfil
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
};

// 7. POP-UP PROMOCIONAL
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
  } catch (err) { console.error("Error cargando popup:", err); }
}

window.guardarPopUpAdmin = async function() {
  const activo = document.getElementById("checkPopUpActive").checked;
  const titulo = document.getElementById("popupTitleAdmin").value;
  const imagen = document.getElementById("popupImgAdmin").value;
  const texto = document.getElementById("popupTextAdmin").value;

  try {
    await setDoc(doc(db, "configuracion", "popup"), { activo, titulo, imagen, texto });
    alert("Configuración de Pop-up guardada con éxito.");
  } catch (err) { alert("Error: " + err.message); }
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
    } catch (err) { alert("Error: " + err.message); }
  }
};

// 8. RESERVA DE TICKETS
window.confirmarReservaFirebase = async function() {
  const premioId = document.getElementById("inputPremioIdSeleccionado").value;
  const numero = document.getElementById("inputNumeroSeleccionado").value;

  if (!numero) { alert("Por favor selecciona un número."); return; }
  if (!currentUserData || currentUserData.ticketsDisponibles < 1) { alert("No tienes suficientes tickets."); return; }

  const premio = listaProductosDB.find(p => p.id === premioId);
  const reqVip = premio ? (premio.nivelVipMinimo || 1) : 1;
  const userVip = currentUserData.nivelVip || 1;

  if (userVip < reqVip) {
    const rankReq = VIP_RANKS[reqVip] ? VIP_RANKS[reqVip].name : `Nivel ${reqVip}`;
    const rankUser = VIP_RANKS[userVip] ? VIP_RANKS[userVip].name : `Nivel ${userVip}`;
    alert(`¡Rango VIP insuficiente! Este sorteo es exclusivo para usuarios Rango ${rankReq} o superior. Tu rango actual es ${rankUser}.`);
    return;
  }

  const docIdReserva = `${premioId}_${numero}`;
  const docRef = doc(db, "reservas", docIdReserva);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) { alert("El número ya fue tomado por otro usuario."); return; }

  try {
    const totalUsados = (currentUserData.totalTicketsUsados || 0) + 1;
    const autoVip = Math.max(userVip, calcularNivelVip(totalUsados));

    await updateDoc(doc(db, "usuarios", currentUser.uid), { 
      ticketsDisponibles: increment(-1),
      totalTicketsUsados: increment(1),
      nivelVip: autoVip
    });
    
    await setDoc(docRef, {
      usuarioId: currentUser.uid,
      nombreUsuario: currentUserData.nombreUsuario,
      premioId: premioId,
      premioNombre: premio ? premio.nombre : "Sorteo",
      numero: numero,
      fecha: new Date().toISOString()
    });

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
    }).catch(e => console.log("Apps Script enviado."));

    alert(`¡Éxito! Número #${numero} reservado.`);
    await cargarDatosUsuario(currentUser.uid);
    window.toggleModal("modalNumeros");
  } catch (err) { alert("Error: " + err.message); }
};

// USER PANEL
window.switchUserTab = function(tabName) {
  document.querySelectorAll(".user-tab-pane").forEach(pane => pane.classList.remove("active"));
  document.querySelectorAll("#modalUserFullscreen .admin-nav-item").forEach(item => item.classList.remove("active"));

  const targetPane = document.getElementById(`userTab-${tabName}`);
  if (targetPane) targetPane.classList.add("active");

  document.getElementById("modalUserFullscreen").classList.add("mobile-pane-active");

  if (tabName === 'sorteos-activos') {
    document.getElementById("userActiveSorteosGrid").innerHTML = document.getElementById("gridProductos").innerHTML;
  } else if (tabName === 'sorteos-participando' || tabName === 'historial-numeros') {
    cargarHistorialUsuario();
  }
};

window.volverMenuUsuarioMobile = function() {
  document.getElementById("modalUserFullscreen").classList.remove("mobile-pane-active");
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
      <div style="background:#f8f9fa; border:1px solid #e9ecef; padding:12px; border-radius:6px; margin-bottom:10px; color:#111;">
        <i class="fa-solid fa-trophy" style="color:var(--accent-yellow);"></i> <strong>${premioNombre}</strong>
      </div>
    `;
  });
}

// AUTH LOGINS
window.registroFirebase = async function() {
  const user = document.getElementById("regUsuario").value;
  const email = document.getElementById("regEmail").value;
  const pass = document.getElementById("regPass").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "usuarios", cred.user.uid), { 
      nombreUsuario: user, 
      email: email, 
      ticketsDisponibles: 0, 
      totalTicketsUsados: 0,
      nivelVip: 1, 
      tiradasDados: 0,
      rol: "user" 
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
    document.getElementById("uPerfDados").innerText = currentUserData.tiradasDados || 0;

    const uVip = currentUserData.nivelVip || 1;
    const uVipEl = document.getElementById("uPerfVip");
    const rankInfo = VIP_RANKS[uVip] || VIP_RANKS[1];
    
    uVipEl.innerText = rankInfo.name;
    uVipEl.className = `vip-badge ${rankInfo.class}`;

    const usados = currentUserData.totalTicketsUsados || 0;
    let nextReq = vipConfig.reqL2 || 5;
    let nextText = "Plata";

    if (uVip === 2) { nextReq = vipConfig.reqL3 || 15; nextText = "Oro"; }
    else if (uVip === 3) { nextReq = vipConfig.reqL4 || 30; nextText = "Platino"; }
    else if (uVip === 4) { nextReq = vipConfig.reqL5 || 50; nextText = "Maestro"; }
    else if (uVip >= 5) { nextReq = usados; nextText = "MÁXIMO"; }

    const perc = Math.min(100, Math.round((usados / nextReq) * 100));
    document.getElementById("uVipProgressText").innerText = `${usados} / ${nextReq}`;
    document.getElementById("uNextVipText").innerText = `Siguiente: ${nextText}`;
    document.getElementById("uVipProgressBar").style.width = `${perc}%`;

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

// MODAL DE SORTEO & CARROUSEL INTERACTIVO DE PRODUCTO
let galeriaActualImgs = [];
let idxGaleriaActual = 0;

window.abrirModalNumeros = async function(premioId) {
  if (!currentUser) {
    alert("Debes iniciar sesión para elegir un número.");
    window.toggleModal("modalLogin");
    return;
  }

  const premio = listaProductosDB.find(p => p.id === premioId);
  if (!premio) return;

  const reqVip = premio.nivelVipMinimo || 1;
  const userVip = currentUserData ? (currentUserData.nivelVip || 1) : 1;

  if (userVip < reqVip) {
    const rankReq = VIP_RANKS[reqVip] ? VIP_RANKS[reqVip].name : `Nivel ${reqVip}`;
    const rankUser = VIP_RANKS[userVip] ? VIP_RANKS[userVip].name : `Nivel ${userVip}`;
    alert(`⚠️ Este sorteo requiere RANGO ${rankReq}. Tu rango actual es ${rankUser}. ¡Sigue participando para subir de rango!`);
    return;
  }

  document.getElementById("modalPremioTitulo").innerText = premio.nombre;
  document.getElementById("modalPremioMonto").innerText = `$${premio.monto.toLocaleString()}`;
  
  const fechaBadge = document.getElementById("modalPremioFecha");
  fechaBadge.setAttribute("data-cronometro-target", premio.fechaSorteo || "");
  actualizarCronometrosDisplays();
  
  const modalVipEl = document.getElementById("modalPremioNivelVip");
  const rankInfo = VIP_RANKS[reqVip] || VIP_RANKS[1];
  modalVipEl.innerText = rankInfo.name;
  modalVipEl.className = `vip-badge ${rankInfo.class}`;

  document.getElementById("inputPremioIdSeleccionado").value = premioId;
  document.getElementById("modalUserTickets").innerText = currentUserData ? currentUserData.ticketsDisponibles : 0;
  
  const userVipBadge = document.getElementById("modalUserVipBadge");
  const userRankInfo = VIP_RANKS[userVip] || VIP_RANKS[1];
  userVipBadge.innerText = userRankInfo.name;
  userVipBadge.className = `vip-badge ${userRankInfo.class}`;

  galeriaActualImgs = premio.imgs && premio.imgs.length > 0 ? premio.imgs : [premio.imgCatalog];
  idxGaleriaActual = 0;
  actualizarImagenModal();

  const miniaturasContainer = document.getElementById("modalPremioMiniaturas");
  miniaturasContainer.innerHTML = "";

  if (galeriaActualImgs.length > 1) {
    galeriaActualImgs.forEach((url, index) => {
      miniaturasContainer.innerHTML += `<img src="${url}" class="thumb-img ${index === 0 ? 'active' : ''}" onclick="seleccionarImagenModal(${index})">`;
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

function actualizarImagenModal() {
  const imgPrincipal = document.getElementById("modalPremioImgPrincipal");
  if (imgPrincipal && galeriaActualImgs.length > 0) {
    imgPrincipal.src = galeriaActualImgs[idxGaleriaActual];
  }
  document.querySelectorAll(".thumb-img").forEach((el, index) => {
    el.classList.toggle("active", index === idxGaleriaActual);
  });
}

window.seleccionarImagenModal = function(index) {
  idxGaleriaActual = index;
  actualizarImagenModal();
};

window.moverCarruselModal = function(dir) {
  if (galeriaActualImgs.length === 0) return;
  idxGaleriaActual = (idxGaleriaActual + dir + galeriaActualImgs.length) % galeriaActualImgs.length;
  actualizarImagenModal();
};

window.seleccionarNumeroNodo = function(numero, isOcupado) {
  if (isOcupado) return;
  document.querySelectorAll(".num-node").forEach(n => n.classList.remove("selected"));
  document.getElementById(`numNode_${numero}`).classList.add("selected");
  document.getElementById("inputNumeroSeleccionado").value = numero;
};

// ADMIN TABS
window.switchAdminTab = function(tabName) {
  document.querySelectorAll(".admin-tab-pane").forEach(pane => pane.classList.remove("active"));
  document.querySelectorAll(".admin-nav-item").forEach(item => item.classList.remove("active"));

  const targetPane = document.getElementById(`adminTab-${tabName}`);
  if (targetPane) targetPane.classList.add("active");

  if (tabName === 'productos') {
    renderizarListaProductosAdmin();
  } else if (tabName === 'usuarios') {
    cargarListaUsuariosAdmin();
  } else if (tabName === 'sorteos' || tabName === 'historico') {
    poblarSelectSorteos();
  } else if (tabName === 'busqueda') {
    cargarListaUsuariosAdmin();
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
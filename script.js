const BASE = "https://berita-indo-api-next.vercel.app/api/cnn-news"

// Jenis-jenis berita (segmen navbar)
const segmen = [
    { id: "terbaru",       nama: "Terbaru",       path: "" },
    { id: "nasional",      nama: "Nasional",      path: "/nasional" },
    { id: "internasional", nama: "Internasional", path: "/internasional" },
    { id: "ekonomi",       nama: "Ekonomi",       path: "/ekonomi" },
    { id: "olahraga",      nama: "Olahraga",      path: "/olahraga" },
    { id: "teknologi",     nama: "Teknologi",     path: "/teknologi" },
    { id: "hiburan",       nama: "Hiburan",       path: "/hiburan" },
    { id: "gaya-hidup",    nama: "Gaya Hidup",    path: "/gaya-hidup" }
]

// "Terbaru" paling akhir supaya berita yang sama muncul dengan label jenisnya
const urutanSemua = [...segmen.slice(1), segmen[0]].map(s => s.id)

/* ---------------- Elemen ---------------- */
const $ = id => document.getElementById(id)
const wadahBerita = $("berita")
const preloader = $("preloader")
const tickerIsi = $("ticker-isi")
const navJalur = $("nav-jalur")
const indikator = $("nav-indikator")
const seksiNama = $("seksi-nama")
const seksiInfo = $("seksi-info")
const formCari = $("form-cari")
const inputCari = $("cari")
const tombolHapus = $("cari-hapus")
const opsiCari = $("cari-opsi")
const kepala = document.querySelector(".kepala")

/* ---------------- State ---------------- */
const state = { id: "terbaru", q: "", scope: "ini" }
const cache = {}          // id -> array berita
const sedangAmbil = {}    // id -> promise (hindari request ganda)
let renderKe = 0
let infoKe = 0
let judulSekarang = ""
let pengamat = null

let mulaiSelesai
const siapAnimasi = new Promise(r => mulaiSelesai = r)

/* ---------------- Utilitas ---------------- */
function aman(teks = "") {
    return String(teks)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

function formatWaktu(tanggal) {
    if (!tanggal) return ""
    const d = new Date(tanggal)
    if (isNaN(d)) return ""
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}

const tunggu = ms => new Promise(r => setTimeout(r, ms))

const placeholder = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'><rect width='16' height='9' fill='#8a8a8a'/></svg>"
)

// Pecah teks jadi huruf-huruf yang bisa dianimasikan satu per satu
function pecahHuruf(el, teks, dasar = 0) {
    el.setAttribute("aria-label", teks)
    el.style.setProperty("--dasar", dasar + "ms")
    el.innerHTML = ""
    let n = 0
    const kata = teks.split(" ")
    kata.forEach((k, idx) => {
        const w = document.createElement("span")
        w.className = "kata"
        w.setAttribute("aria-hidden", "true")
        for (const h of k) {
            const s = document.createElement("span")
            s.className = "huruf"
            s.style.setProperty("--i", n++)
            s.textContent = h
            w.appendChild(s)
        }
        el.appendChild(w)
        if (idx < kata.length - 1) el.appendChild(document.createTextNode(" "))
    })
}

function setSeksi(teks) {
    if (teks === judulSekarang) return
    const awal = judulSekarang === ""
    judulSekarang = teks
    pecahHuruf(seksiNama, teks, awal ? 1850 : 0)
}

// Angka naik dari 0 (hitung mundur ala papan skor)
function setInfo(isi, akhiran = "") {
    const token = ++infoKe
    if (typeof isi !== "number") { seksiInfo.textContent = isi; return }
    const awal = performance.now()
    const langkah = t => {
        if (token !== infoKe) return
        const p = Math.min(1, (t - awal) / 900)
        const e = 1 - Math.pow(1 - p, 3)
        seksiInfo.textContent = Math.round(isi * e) + " " + akhiran
        if (p < 1) requestAnimationFrame(langkah)
    }
    requestAnimationFrame(langkah)
}

// Sorot kata yang dicari di dalam judul
function sorot(teks, kata) {
    const re = new RegExp("(" + kata.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi")
    return teks.split(re).map((p, i) => i % 2 ? `<mark>${aman(p)}</mark>` : aman(p)).join("")
}

// Dipanggil saat gambar selesai dimuat
function gambarSiap(img) {
    img.classList.add("termuat")
    img.parentElement.classList.add("siap")
}

/* ---------------- Scroll: progress + tombol naik ---------------- */
const progress = $("progress")
const naik = $("naik")
const cincin = $("cincin")
const KELILING = 119.4

window.addEventListener("scroll", () => {
    const tinggi = document.documentElement.scrollHeight - window.innerHeight
    const p = tinggi > 0 ? window.scrollY / tinggi : 0
    progress.style.transform = `scaleX(${p})`
    cincin.style.strokeDashoffset = KELILING * (1 - p)
    naik.classList.toggle("tampil", window.scrollY > 600)
}, { passive: true })

naik.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }))

/* ---------------- Tema terang / gelap ---------------- */
const tombolTema = $("tema")

function setTema(t, simpan = true) {
    document.documentElement.dataset.tema = t
    tombolTema.textContent = t === "gelap" ? "Mode terang" : "Mode gelap"
    tombolTema.setAttribute("aria-pressed", String(t === "gelap"))
    if (simpan) { try { localStorage.setItem("tema", t) } catch (e) {} }
}

let temaAwal = null
try { temaAwal = localStorage.getItem("tema") } catch (e) {}
setTema(temaAwal || (matchMedia("(prefers-color-scheme: dark)").matches ? "gelap" : "terang"), false)

tombolTema.addEventListener("click", () => {
    const html = document.documentElement
    html.classList.add("ganti-tema")
    setTema(html.dataset.tema === "gelap" ? "terang" : "gelap")
    setTimeout(() => html.classList.remove("ganti-tema"), 600)
})

/* ---------------- Navbar ---------------- */
segmen.forEach((s, i) => {
    const a = document.createElement("a")
    a.href = "#" + s.id
    a.textContent = s.nama
    a.dataset.id = s.id
    a.className = "a"
    a.style.setProperty("--i", i)
    navJalur.appendChild(a)
})

function posisiIndikator() {
    const a = navJalur.querySelector("a.aktif")
    if (!a) return
    indikator.style.width = a.offsetWidth + "px"
    indikator.style.transform = `translateX(${a.offsetLeft}px)`
}

function aktifkanNav(id) {
    let aktif = null
    navJalur.querySelectorAll("a").forEach(a => {
        const cocok = a.dataset.id === id
        a.classList.toggle("aktif", cocok)
        if (cocok) { a.setAttribute("aria-current", "page"); aktif = a }
        else a.removeAttribute("aria-current")
    })
    if (!aktif) return

    posisiIndikator()
    navJalur.scrollTo({
        left: aktif.offsetLeft - (navJalur.clientWidth - aktif.offsetWidth) / 2,
        behavior: "smooth"
    })

    // transisi baru dinyalakan setelah posisi awal terpasang
    if (!indikator.classList.contains("siap")) {
        requestAnimationFrame(() => requestAnimationFrame(() => indikator.classList.add("siap")))
    }
}

window.addEventListener("resize", posisiIndikator)
if (document.fonts && document.fonts.ready) document.fonts.ready.then(posisiIndikator)

/* ---------------- Tampilan berita ---------------- */
const kartuSkel = () => `
    <article class="skel tampil">
        <div class="gambar"></div>
        <div class="isi">
            <div class="garis-skel pendek"></div>
            <div class="garis-skel"></div>
            <div class="garis-skel"></div>
        </div>
    </article>`

function skeleton(denganUtama = true) {
    const utama = denganUtama ? `
        <article class="utama skel tampil">
            <div class="gambar"></div>
            <div class="isi">
                <div class="garis-skel pendek"></div>
                <div class="garis-skel"></div>
                <div class="garis-skel"></div>
                <div class="garis-skel pendek"></div>
            </div>
        </article>` : ""
    wadahBerita.innerHTML = utama + `<div class="lain">${kartuSkel().repeat(6)}</div>`
}

function kartu(berita, i, opsi = {}) {
    const utama = !!opsi.utama
    const gambar = (utama && berita.image?.large) || berita.image?.small || berita.image?.large || placeholder
    const waktu = formatWaktu(berita.isoDate || berita.pubDate)
    const judul = opsi.kata && opsi.kata.length ? sorot(berita.title || "", opsi.kata) : aman(berita.title)
    const meta = (opsi.tag ? `<span class="tag">${aman(opsi.tag)}</span>` : "") +
                 (waktu ? `<time>${waktu}</time>` : "")

    return `
    <article class="${utama ? "utama" : ""}">
        <div class="gambar">
            <img src="${aman(gambar)}" alt="${aman(berita.title)}" loading="${i < 3 ? "eager" : "lazy"}"
                 onload="gambarSiap(this)"
                 onerror="this.onerror=null;this.src='${placeholder}';gambarSiap(this)">
        </div>
        <div class="isi">
            <div class="meta">${meta}</div>
            <h3>${judul}</h3>
            <a class="baca" href="${aman(berita.link)}" target="_blank" rel="noopener">Baca selengkapnya</a>
        </div>
    </article>`
}

// Kartu terbuka berurutan saat masuk layar
function aktifkanAnimasiMasuk() {
    if (pengamat) pengamat.disconnect()
    const semua = document.querySelectorAll("#berita article:not(.tampil)")

    if (!("IntersectionObserver" in window)) {
        semua.forEach(k => k.classList.add("tampil"))
        return
    }

    pengamat = new IntersectionObserver((entri, p) => {
        let urutan = 0
        entri.forEach(e => {
            if (!e.isIntersecting) return
            e.target.style.setProperty("--tunda", (urutan++ * 140) + "ms")
            e.target.classList.add("tampil")
            p.unobserve(e.target)
        })
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" })

    semua.forEach(k => pengamat.observe(k))
}

function setelahTampil() {
    wadahBerita.querySelectorAll("img").forEach(img => {
        if (img.complete && img.naturalWidth) gambarSiap(img)
    })
    siapAnimasi.then(aktifkanAnimasiMasuk)
}

function setTicker(data) {
    const judul = data.slice(0, 10).map(b =>
        `<a href="${aman(b.link)}" target="_blank" rel="noopener">${aman(b.title)}</a>`
    ).join("")
    tickerIsi.innerHTML = judul + judul
}

function pesan(judul, isi, tombol = []) {
    wadahBerita.innerHTML = `
        <div class="pesan">
            <h3>${judul}</h3>
            <p>${isi}</p>
            ${tombol.length ? `<div class="tombol-grup">${tombol.map((t, i) =>
                `<button type="button" data-aksi="${i}" class="${t.kosong ? "kosong" : ""}">${t.teks}</button>`).join("")}</div>` : ""}
        </div>`
    wadahBerita.querySelectorAll("button").forEach(b =>
        b.addEventListener("click", () => tombol[b.dataset.aksi].aksi()))
}

function tampilkanKategori(data) {
    if (!data.length) {
        pesan("Belum ada berita", "Coba pilih jenis berita yang lain.")
        setInfo("0 berita")
        return
    }
    wadahBerita.innerHTML =
        kartu(data[0], 0, { utama: true }) +
        `<div class="lain">${data.slice(1).map((b, i) => kartu(b, i + 1)).join("")}</div>`
    setInfo(data.length, "berita")
    setTicker(data)
    setelahTampil()
}

function tampilkanHasil(ids) {
    const kata = state.q.toLowerCase().split(/\s+/).filter(Boolean)

    if (ids.every(i => !cache[i])) { tampilkanError(); return }

    const dilihat = new Set()
    const hasil = []
    ids.forEach(id => {
        const nama = segmen.find(s => s.id === id).nama
        ;(cache[id] || []).forEach(b => {
            if (!b.link || dilihat.has(b.link)) return
            const t = (b.title || "").toLowerCase()
            if (kata.every(k => t.includes(k))) {
                dilihat.add(b.link)
                hasil.push({ b, tag: nama })
            }
        })
    })

    if (!hasil.length) {
        const tombol = []
        if (state.scope === "ini") tombol.push({ teks: "Cari di semua jenis", aksi: () => setScope("semua") })
        tombol.push({ teks: "Hapus pencarian", kosong: true, aksi: hapusCari })
        pesan("Tidak ada hasil", `Tidak ada berita yang cocok dengan “${aman(state.q)}”.`, tombol)
        setInfo("0 berita ditemukan")
        return
    }

    wadahBerita.innerHTML = `<div class="lain">${hasil.map(({ b, tag }, i) => kartu(b, i, { tag, kata })).join("")}</div>`
    setInfo(hasil.length, "berita ditemukan")
    setelahTampil()
}

function tampilkanError() {
    pesan("Berita belum bisa dimuat", "Periksa koneksi internet atau coba lagi sebentar lagi.",
        [{ teks: "Coba lagi", aksi: () => render() }])
    setInfo("")
}

/* ---------------- Ambil data ---------------- */
function ambil(id) {
    if (cache[id]) return Promise.resolve(cache[id])
    if (sedangAmbil[id]) return sedangAmbil[id]

    const seg = segmen.find(s => s.id === id)
    sedangAmbil[id] = fetch(BASE + seg.path)
        .then(hasil => {
            if (!hasil.ok) throw new Error("Respons server: " + hasil.status)
            return hasil.json()
        })
        .then(json => {
            cache[id] = Array.isArray(json.data) ? json.data : []
            return cache[id]
        })
        .finally(() => { delete sedangAmbil[id] })

    return sedangAmbil[id]
}

function render() {
    const token = ++renderKe
    const { id, q, scope } = state

    // ---- tanpa pencarian: tampilan jenis berita ----
    if (!q) {
        setSeksi(segmen.find(s => s.id === id).nama)
        if (cache[id]) { tampilkanKategori(cache[id]); return Promise.resolve() }

        skeleton()
        setInfo("Memuat...")
        return ambil(id)
            .then(data => { if (token === renderKe) tampilkanKategori(data) })
            .catch(err => { console.error(err); if (token === renderKe) tampilkanError() })
    }

    // ---- dengan pencarian ----
    setSeksi("Pencarian")
    const ids = scope === "semua" ? urutanSemua : [id]

    if (ids.some(i => !cache[i])) {
        skeleton(false)
        setInfo("Mencari...")
    }

    return Promise.allSettled(ids.map(ambil)).then(() => {
        if (token === renderKe) tampilkanHasil(ids)
    })
}

/* ---------------- Navigasi jenis berita ---------------- */
function idDariHash() {
    const id = location.hash.replace("#", "")
    return segmen.some(s => s.id === id) ? id : "terbaru"
}

function keAwalDaftar() {
    if (window.scrollY > kepala.offsetHeight) window.scrollTo({ top: kepala.offsetHeight })
}

function pindah(id) {
    state.id = id
    aktifkanNav(id)
    document.title = segmen.find(s => s.id === id).nama + " | Berita Terkini"
    keAwalDaftar()
    return render()
}

window.addEventListener("hashchange", () => pindah(idDariHash()))

/* ---------------- Pencarian ---------------- */
let tundaCari

function setScope(s) {
    state.scope = s
    opsiCari.querySelectorAll("button").forEach(b => b.classList.toggle("aktif", b.dataset.scope === s))
    render()
}

function terapkanCari() {
    const q = inputCari.value.trim()
    if (q === state.q) return
    state.q = q
    opsiCari.hidden = !q
    if (!q) {
        state.scope = "ini"
        opsiCari.querySelectorAll("button").forEach(b => b.classList.toggle("aktif", b.dataset.scope === "ini"))
    } else {
        keAwalDaftar()
    }
    render()
}

function hapusCari() {
    inputCari.value = ""
    formCari.classList.remove("berisi")
    terapkanCari()
    inputCari.focus()
}

inputCari.addEventListener("input", () => {
    formCari.classList.toggle("berisi", inputCari.value.length > 0)
    clearTimeout(tundaCari)
    tundaCari = setTimeout(terapkanCari, 180)
})

formCari.addEventListener("submit", e => {
    e.preventDefault()
    clearTimeout(tundaCari)
    terapkanCari()
})

tombolHapus.addEventListener("click", hapusCari)

opsiCari.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => setScope(b.dataset.scope)))

// "/" untuk fokus ke kolom cari, Esc untuk menghapus
document.addEventListener("keydown", e => {
    const mengetik = /^(input|textarea)$/i.test(document.activeElement.tagName)
    if (e.key === "/" && !mengetik) {
        e.preventDefault()
        inputCari.focus()
    } else if (e.key === "Escape" && document.activeElement === inputCari) {
        if (inputCari.value) hapusCari()
        else inputCari.blur()
    }
})

/* ---------------- Layar pembuka & urutan masuk ---------------- */
let kunjunganUlang = false
try {
    kunjunganUlang = sessionStorage.getItem("intro") === "1"
    sessionStorage.setItem("intro", "1")
} catch (e) {}

pecahHuruf($("pre-judul"), "Berita Terkini")
pecahHuruf($("judul"), "Berita Terkini")

let dibuka = false

function bukaHalaman() {
    if (dibuka) return
    dibuka = true

    $("pre-isi").classList.add("penuh")
    tunggu(500)
        .then(() => { preloader.classList.add("selesai"); return tunggu(380) })
        .then(() => { document.body.classList.add("mulai"); posisiIndikator(); return tunggu(1700) })
        .then(() => { mulaiSelesai(); preloader.style.display = "none" })
}

// Buka setelah data pertama datang DAN animasi pembuka sempat main
state.id = idDariHash()
aktifkanNav(state.id)
document.title = segmen.find(s => s.id === state.id).nama + " | Berita Terkini"

Promise.all([render(), tunggu(kunjunganUlang ? 800 : 2600)]).then(bukaHalaman)
setTimeout(bukaHalaman, 10000)   // pengaman bila ada yang macet

# Detektor Tracker

**Offline GPS tracker za detektoriste** - prati kretanje, beleži checkpointe, čuva putanje.

---

## 🎯 Šta radi?

- **START** → pokreće GPS tracking i crta tvoje kretanje na sivoj mapi
- **CHECKPOINT** → beleži metu sa opisom i putanjom do nje
- **ISKOPANO** → označava checkpoint kao "DUG" (ali čuva putanju)
- **100% OFFLINE** → svi podaci se čuvaju lokalno (IndexedDB)

---

## 🚀 Kako koristiti?

### 1️⃣ Na TELEFONU (pravi GPS):

1. Otvori `index.html` u Chrome/Safari
2. Dozvoli pristup lokaciji
3. Klikni **START** i kreni sa detektorom
4. Kad pronađeš metu → **CHECKPOINT** → upiši opis
5. **STOP** kad završiš teren

### 2️⃣ Na WINDOWS-u (testiranje):

```powershell
# Pokreni lokalni server (iz foldera sa aplikacijom)
python -m http.server 8000
```

Pa otvori: `http://localhost:8000`

*Napomena: Windows nema GPS, ali možeš testirati UI.*

---

## 📁 Struktura

```
/App za Detektor
├── index.html           # UI
├── style.css            # Dizajn (minimalistički)
├── app.js               # Glavna logika
├── db.js                # IndexedDB storage
├── service-worker.js    # Offline rad
├── manifest.json        # PWA konfiguracija
└── README.md            # Ovo
```

---

## 🔑 Ključne funkcije

✅ **Neutralna mapa** - siva podloga, bez Google Maps detalja  
✅ **Track-based navigacija** - pamti SAMO gde si ti prošao  
✅ **Checkpointi** - svaki ima svoju putanju od starta  
✅ **Status: ACTIVE/DUG** - iskopane mete ostaju sive  
✅ **Offline** - radi bez interneta  
✅ **Responzivno** - Windows i mobilni  

---

## 🧪 Testiranje

1. Otvori DevTools (F12)
2. Sensors → Location → Custom location
3. Unesi lat/lon koordinate
4. Testuj tracking

---

## 📱 PWA (Progressive Web App)

Možeš **instalirati** kao aplikaciju:

- Chrome (Android/Desktop): Meni → "Install app"
- Safari (iOS): Share → "Add to Home Screen"

---

## 🛠️ Tehnologije

- **HTML5 Canvas** za crtanje mape
- **Geolocation API** za GPS tracking
- **IndexedDB** za lokalni storage
- **Service Worker** za offline
- **Vanilla JavaScript** (bez framework-a)

---

## 💡 Kako radi logika?

```
START → prati GPS tačke → crta liniju
       ↓
CHECKPOINT → zapamti trenutnu poziciju + CELU putanju do sad
       ↓
DRUGI CHECKPOINT → nova linija od starta (ili prethodnog)
       ↓
ISKOPANO → status → DUG, ali putanja ostaje u bazi
```

---

**Napravio:** GitHub Copilot (Claude Sonnet 4.5)  
**Za:** Detektoriste koji hoće alat, a ne igračku 🔥

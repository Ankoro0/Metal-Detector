# 📍 Detektor Tracker

**Offline GPS tracker za detektoriste** - prati kretanje, beleži checkpointe, čuva putanje.

🔗 **Live Demo:** [your-app.netlify.app](#) *(dodaj link nakon deploya)*

---

## 🎯 Funkcije

✅ **GPS Tracking** - prati tvoje kretanje u realnom vremenu  
✅ **Checkpointi** - beleži mete sa opisom, signalom, dubinom, ID range-om  
✅ **4 Statusa** - ACTIVE, ISKOPANO, IGNORISANO, PROVERI OPET  
✅ **100% Offline** - radi bez interneta (IndexedDB + Service Worker)  
✅ **Export/Import** - backup podataka u JSON formatu  
✅ **PWA** - instalira se kao aplikacija na telefonu  
✅ **Minimalistička mapa** - siva podloga, bez nepotrebnih detalja  

---

## 🚀 Kako koristiti

### **Na telefonu:**
1. Otvori link u Chrome/Safari
2. Dozvoli pristup lokaciji
3. Klikni **START** i kreni sa detektorom
4. Kad pronađeš signal → **CHECKPOINT** → unesi podatke
5. **STOP** kad završiš

### **Desktop testiranje:**
Klikni **🧪 TEST MODE** da simuliraš GPS.

---

## 📱 Instalacija kao App

**Android (Chrome):**
- Meni → "Add to Home Screen"

**iOS (Safari):**
- Share → "Add to Home Screen"

---

## 💾 Backup podataka

- **Export** → JSON fajl (čuva sve checkpointe + GPS track)
- **Import** → učitaj nazad ili podeli sa drugima

---

## 🛠️ Tehnologije

- HTML5 Canvas (mapa)
- Geolocation API (GPS)
- IndexedDB (offline storage)
- Service Worker (offline rad)
- PWA (instalacija)

---

## 📊 Za AI analizu

Exportovani JSON sadrži strukturirane podatke:
- GPS track (sve tačke)
- Checkpointi sa signalom, dubinom, ID range-om
- Statusi i vremenski pečati

Šalji JSON AI-ju za pattern matching i predikcije!

---

**Made with 🔥 by GitHub Copilot (Claude Sonnet 4.5)**


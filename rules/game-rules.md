## Oyun geliştirme (OYN)

Bu bölüm yalnızca oyun projelerinde yüklenir; motor imzası bulunmazsa hiç
enjekte edilmez.

- **Kare hızına bağlı kod yazma.** Hareket, sayaç ve yumuşatma `Time.deltaTime`
  ile ölçeklenir. Ölçeklenmemiş kod 30 fps'de doğru, 144 fps'de bozuk çalışır —
  ve bu, test edilen makinede görünmez.
- **Sıcak yolda arama yapma.** `GameObject.Find`, `FindObjectOfType`,
  `GetComponent`, `Camera.main` her karede çağrılmaz. Referansı `Awake` içinde
  bir kez çöz ya da `[SerializeField]` ile bağla.
- **Fiziği fizik adımında yürüt.** `Rigidbody` işlemleri `FixedUpdate` içine
  gider; `Update` içinde kare hızına göre kayar.
- **Sıcak yolda tahsis yapma.** Her karede LINQ, yeni koleksiyon ya da dize
  birleştirme çöp üretir ve takılma olarak görünür.
- **İstemciye güvenme.** Para, puan, ilerleme ve satın alma durumu `PlayerPrefs`
  gibi düz metin depolarda tutulmaz; oyuncu onu düzenleyebilir.
- **Sahne ağacına yol yazma.** `get_node("../../Player")` düğüm taşınınca
  sessizce kopar. Dışa aktarılmış `NodePath` ya da sinyal kullan.
- **Motor üretimi dosyalara dokunma.** `.meta`, `.uasset`, `.umap`, `.tscn`,
  `Library/`, `Intermediate/` — bunları motor üretir. Elle düzenlenen bir
  `.meta` sahnedeki tüm referansları koparır ve bozulma commit'ten çok sonra
  fark edilir.
- **Determinizm gerektiren yerde tohumsuz rastgelelik kullanma.** Tekrar
  oynatma, ağ senkronu ve prosedürel üretim aynı tohumla aynı sonucu vermeli.
- **Oyun dengesi değerlerini koda gömme.** Hasar, hız, fiyat ve süre kodda
  sabit durursa tasarımcı onları değiştiremez; veri dosyasına ya da
  ScriptableObject'e taşı.

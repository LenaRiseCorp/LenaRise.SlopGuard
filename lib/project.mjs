/**
 * Proje türü tespiti.
 *
 * Şu an tek tüketicisi oyun kuralları: OYN kural metni yalnızca bir oyun
 * projesinde enjekte edilir. Sebebi doğrudan kendi taksonomimiz — her oturuma
 * kullanılmayacak kural yüklemek aşırı bağlamdır (AGT-02) ve uzun kural seti
 * okunmaz hale gelir.
 *
 * Desenler için aynı koşul gerekmiyor: OYN desenleri motor API adlarına
 * dayanıyor (transform.Translate, PlayerPrefs, get_node), dolayısıyla oyun
 * olmayan projelerde kendiliğinden sessiz kalıyorlar. Tespit yalnızca metin
 * enjeksiyonunu kapıyor, taramayı değil.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Kökte aranan imzalar. Her biri tek başına yeterli. */
const SIGNATURES = [
  { engine: 'Unity', test: (root) => existsSync(join(root, 'Assets')) && existsSync(join(root, 'ProjectSettings')) },
  { engine: 'Godot', test: (root) => existsSync(join(root, 'project.godot')) },
  { engine: 'Unreal', test: (root) => hasExtension(root, '.uproject') },
];

function hasExtension(root, ext) {
  try {
    return readdirSync(root).some((name) => name.endsWith(ext));
  } catch {
    // Kök okunamıyorsa tespit yapılamaz; bu bir hata değil, bilgi yokluğu.
    // Çağıran boş listeyi "oyun projesi değil" diye okur ve kural enjekte etmez.
    return false;
  }
}

/**
 * Kökteki oyun motorlarını döndürür. Kök verilmezse ya da okunamazsa boş dizi.
 * @returns {string[]} örn. ['Unity']
 */
export function detectEngines(root) {
  if (!root) return [];
  return SIGNATURES.filter((s) => {
    try {
      return s.test(root);
    } catch {
      return false;
    }
  }).map((s) => s.engine);
}

export function isGameProject(root) {
  return detectEngines(root).length > 0;
}

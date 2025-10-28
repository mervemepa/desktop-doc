export const dict = {
  tr: {
    mediaLibrary: "Medya Kütüphanesi",
    howItWorks: "NASIL ÇALIŞIR?",
    guideTitle: "DESKTOP DOCUMENTARY – HIZLI REHBER",
    guideSteps: [
      "Görsel ve videoları bu kutuya sürükleyip bırakın.",
      "Her birini zaman çizelgesine ekleyin.",
      "Gerekirse başlık ve captions yazın; crossfade süresini ayarlayın.",
      "Play ile önizleyin; Record ile kaydedip WebM dosyası olarak indirin.",
    ],
    ffmpegHint:
      "MP4'e dönüştürmek için: ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p output.mp4",
    fileDropInstructions: "Dosyalarınızı buraya sürükleyin ya da tıklayın.",
    add: "Ekle",
    stageAndRecord: "SAHNE VE KAYIT",
    play: "Play",
    pause: "Pause",
    recordWebM: "Record (WebM)",
    stop: "Stop",
    outputResolution: "Çıkış Çözünürlüğü",
    crossfadeSeconds: "Crossfade (sn)",
    themeHeading: "Cyberpunk Renk Teması",
    selected: "Seçili",
    globalTitleLabel: "Genel Başlık",
    projectTitlePlaceholder: "Proje başlığı…",
    timeline: "ZAMAN ÇİZELGESİ",
    timelineReorderHint: "(Sürükleyip bırakarak sıralayabilirsiniz)",
    timelineEmpty:
      'Henüz bir klip eklenmedi. Kütüphaneden "Ekle" butonuna tıklayın.',
    duration: "Süre",
    videoLabel: "Video",
    captionPlaceholder: "Caption…",
    dropHere: "Buraya bırakın",
    language: "Dil",
  },
  en: {
    mediaLibrary: "Media Library",
    howItWorks: "HOW IT WORKS?",
    guideTitle: "DESKTOP DOCUMENTARY – QUICK GUIDE",
    guideSteps: [
      "Drag and drop images/videos here.",
      "Add each to the timeline.",
      "Optionally add title and captions; set crossfade.",
      "Preview with Play; Record to save as WebM.",
    ],
    ffmpegHint:
      "To convert to MP4: ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p output.mp4",
    fileDropInstructions: "Drag files here or click to select.",
    add: "Add",
    stageAndRecord: "STAGE & RECORD",
    play: "Play",
    pause: "Pause",
    recordWebM: "Record (WebM)",
    stop: "Stop",
    outputResolution: "Output Resolution",
    crossfadeSeconds: "Crossfade (s)",
    themeHeading: "Cyberpunk Color Theme",
    selected: "Selected",
    globalTitleLabel: "Global Title",
    projectTitlePlaceholder: "Project title…",
    timeline: "TIMELINE",
    timelineReorderHint: "(Drag and drop to reorder)",
    timelineEmpty: 'No clips yet. Click "Add" in the library.',
    duration: "Duration",
    videoLabel: "Video",
    captionPlaceholder: "Caption…",
    dropHere: "Drop here",
    language: "Language",
  },
};

export function makeI18n() {
  const storeKey = "desktop-doc:lang";
  let lang = localStorage.getItem(storeKey) || "tr";

  const t = (key) => dict[lang]?.[key] ?? dict.en[key] ?? key;
  const setLang = (newLang) => {
    lang = newLang;
    localStorage.setItem(storeKey, newLang);
  };

  return {
    t,
    setLang,
    get lang() {
      return lang;
    },
  };
}

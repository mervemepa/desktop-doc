import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Play, Pause, Plus, Upload, Circle, StopCircle, Film, Image as ImageIcon, Type, GripVertical, Palette } from "lucide-react";
import { makeI18n } from "./i18n";

const i18n = makeI18n();

function formatSeconds(s) {
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function DesktopDocWorkshopApp() {
  // Media library (files user dropped)
  const [library, setLibrary] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [crossfade, setCrossfade] = useState(1.0);
  const [canvasSize, setCanvasSize] = useState({ w: 1280, h: 720 });
  const [recState, setRecState] = useState("idle");
  const [globalTitle, setGlobalTitle] = useState("");
  const [showTitle, setShowTitle] = useState(true);
  const [loadingStates, setLoadingStates] = useState({});
  const [selectedColor, setSelectedColor] = useState("green");
  const [uiLang, setUiLang] = useState(i18n.lang);

  // Add missing refs
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const rafRef = useRef(null);
  const videoElementsRef = useRef(new Map());
  const imageElementsRef = useRef(new Map());

  // 90s Terminal/CRT color palette - ensure this is defined properly
  const cyberColors = useMemo(() => ({
    green: { primary: "#00aa00", shadow: "#00aa00" },
    amber: { primary: "#ffaa00", shadow: "#ffaa00" },
    red: { primary: "#cc0000", shadow: "#cc0000" },
    blue: { primary: "#0066cc", shadow: "#0066cc" },
    purple: { primary: "#6600cc", shadow: "#6600cc" }
  }), []);

  // Get current color with fallback
  const getCurrentColor = useCallback(() => {
    return cyberColors[selectedColor] || cyberColors.green;
  }, [cyberColors, selectedColor]);

  // Derived: total duration
  const totalDuration = useMemo(() => {
    return timeline.reduce((acc, clip) => {
      const lib = library.find((l) => l.id === clip.libId);
      if (!lib) return acc;
      if (lib.type === "video") {
        return acc + (lib.duration || 0);
      }
      return acc + (clip.duration || 3);
    }, 0);
  }, [timeline, library]);

  // Compute which clip is active at given progress
  const activeIndexAt = useCallback((t) => {
    let acc = 0;
    for (let i = 0; i < timeline.length; i++) {
      const clip = timeline[i];
      const lib = library.find((l) => l.id === clip.libId);
      const d = lib?.type === "video" ? lib.duration || 0 : clip.duration || 3;
      if (t < acc + d) return { index: i, localTime: t - acc, duration: d };
      acc += d;
    }
    return { index: -1, localTime: 0, duration: 0 };
  }, [timeline, library]);

  // Utility functions
  const coverRect = useCallback((srcW, srcH, dstW, dstH) => {
    const srcRatio = srcW / srcH;
    const dstRatio = dstW / dstH;
    let dw, dh;
    
    if (srcRatio > dstRatio) {
      dh = dstH;
      dw = dh * srcRatio;
    } else {
      dw = dstW;
      dh = dw / srcRatio;
    }
    
    const x = (dstW - dw) / 2;
    const y = (dstH - dh) / 2;
    return { x, y, dw, dh };
  }, []);

  const wrapText = useCallback((ctx, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(" ");
    let line = "";
    let yy = y;
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, yy);
        line = words[n] + " ";
        yy += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, yy);
  }, []);

  // Image loading
  const loadImage = useCallback((src) =>
    new Promise((resolve, reject) => {
      if (imageElementsRef.current.has(src)) {
        resolve(imageElementsRef.current.get(src));
        return;
      }

      const img = new Image();
      img.onload = () => {
        imageElementsRef.current.set(src, img);
        resolve(img);
      };
      img.onerror = reject;
      img.crossOrigin = "anonymous";
      img.src = src;
    }), []);

  // Video probing
  const probeVideo = useCallback((src) =>
    new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      
      const handleLoadedMetadata = () => {
        resolve({
          width: v.videoWidth,
          height: v.videoHeight,
          duration: v.duration,
          src,
        });
        cleanup();
      };

      const handleError = reject;
      const cleanup = () => {
        v.removeEventListener("loadedmetadata", handleLoadedMetadata);
        v.removeEventListener("error", handleError);
        v.remove();
      };

      v.addEventListener("loadedmetadata", handleLoadedMetadata);
      v.addEventListener("error", handleError);
      v.src = src;
    }), []);

  // Get video element
  const getVideoElement = useCallback((lib) => {
    if (videoElementsRef.current.has(lib.id)) {
      return videoElementsRef.current.get(lib.id);
    }

    const v = document.createElement("video");
    v.src = lib.url;
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.loop = false;
    v.preload = "auto";
    
    videoElementsRef.current.set(lib.id, v);
    return v;
  }, []);

  // Drawing functions
  const drawMedia = useCallback(async (lib, ctx, currentTime = 0) => {
    const { w, h } = canvasSize;
    
    if (lib.type === "image") {
      try {
        const img = await loadImage(lib.url);
        const { x, y, dw, dh } = coverRect(img.width, img.height, w, h);
        ctx.drawImage(img, x, y, dw, dh);
      } catch (error) {
        console.error('Error drawing image:', error);
      }
    } else if (lib.type === "video") {
      const v = getVideoElement(lib);
      
      const targetTime = Math.min(v.duration - 0.01, Math.max(0, currentTime));
      if (Math.abs(v.currentTime - targetTime) > 0.1) {
        v.currentTime = targetTime;
      }

      try {
        if (v.readyState >= 2) {
          const { x, y, dw, dh } = coverRect(
            v.videoWidth || lib.width, 
            v.videoHeight || lib.height, 
            w, 
            h
          );
          ctx.drawImage(v, x, y, dw, dh);
        }
      } catch (error) {
        console.error('Error drawing video:', error);
      }
    }
  }, [canvasSize, loadImage, getVideoElement, coverRect]);

  const drawTitle = useCallback((ctx, text, w) => {
    const pad = 24;
    const maxWidth = w - pad * 2;
    const currentColor = getCurrentColor();
    
    ctx.font = "bold 42px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const textWidth = ctx.measureText(text.toUpperCase()).width;
    ctx.fillRect(pad - 10, pad - 10, Math.min(textWidth + 20, maxWidth + 20), 60);
    
    ctx.fillStyle = currentColor.primary;
    ctx.shadowColor = currentColor.shadow;
    ctx.shadowBlur = 10;
    wrapText(ctx, text.toUpperCase(), pad, pad, maxWidth, 48);
    
    ctx.shadowBlur = 0;
  }, [wrapText, getCurrentColor]);

  const drawCaption = useCallback((ctx, text, w, h) => {
    const pad = 60;
    const maxWidth = w - pad * 2;
    const currentColor = getCurrentColor();
    
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    const metrics = ctx.measureText(text.toUpperCase());
    const boxW = Math.min(maxWidth, metrics.width + 40);
    const boxH = 44;
    
    const boxX = (w - boxW) / 2;
    ctx.fillRect(boxX, h - pad - boxH, boxW, boxH);
    
    ctx.strokeStyle = currentColor.primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, h - pad - boxH, boxW, boxH);
    
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = currentColor.shadow;
    ctx.shadowBlur = 5;
    
    ctx.fillText(text.toUpperCase(), w / 2, h - pad - 12);
    ctx.shadowBlur = 0;
  }, [getCurrentColor]);

  // Render function
  const renderAtTime = useCallback((t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (timeline.length === 0) return;

    const { index, localTime } = activeIndexAt(t);
    if (index < 0) return;

    const drawClip = async (clipIndex, alpha = 1) => {
      const clip = timeline[clipIndex];
      const lib = library.find((l) => l.id === clip.libId);
      if (!lib) return;

      ctx.save();
      ctx.globalAlpha = alpha;
      
      try {
        await drawMedia(lib, ctx, localTime);
        if (clip.caption) {
          drawCaption(ctx, clip.caption, canvas.width, canvas.height);
        }
      } catch (error) {
        console.error('Error drawing clip:', error);
      }
      
      ctx.restore();
    };

    // Crossfade logic
    const isFading = localTime < crossfade && index > 0;
    if (isFading) {
      const f = Math.min(1, localTime / crossfade);
      Promise.all([
        drawClip(index - 1, 1 - f),
        drawClip(index, f)
      ]);
    } else {
      drawClip(index, 1);
    }

    if (showTitle && globalTitle) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawTitle(ctx, globalTitle, canvas.width);
      ctx.restore();
    }
  }, [timeline, library, activeIndexAt, crossfade, showTitle, globalTitle, drawMedia, drawCaption, drawTitle]);

  // File handling
  const onFiles = async (files) => {
    const items = [];
    
    for (const file of files) {
      const id = crypto.randomUUID();
      
      setLoadingStates(prev => ({ ...prev, [id]: true }));
      
      try {
        if (file.type.startsWith("image")) {
          const url = URL.createObjectURL(file);
          const img = await loadImage(url);
          items.push({ 
            id, 
            type: "image", 
            file, 
            url, 
            width: img.width, 
            height: img.height 
          });
        } else if (file.type.startsWith("video")) {
          const url = URL.createObjectURL(file);
          const meta = await probeVideo(url);
          items.push({ 
            id, 
            type: "video", 
            file, 
            url, 
            width: meta.width, 
            height: meta.height, 
            duration: meta.duration 
          });
        }
      } catch (error) {
        console.error(`Failed to process file ${file.name}:`, error);
      } finally {
        setLoadingStates(prev => {
          const newState = { ...prev };
          delete newState[id];
          return newState;
        });
      }
    }
    
    if (items.length > 0) {
      setLibrary((prev) => [...prev, ...items]);
    }
  };

  // Timeline functions
  const addToTimeline = useCallback((libId) => {
    setTimeline((t) => [...t, { id: crypto.randomUUID(), libId, duration: 4, caption: "" }]);
  }, []);

  const removeFromTimeline = useCallback((clipId) => {
    setTimeline((t) => t.filter((c) => c.id !== clipId));
  }, []);

  // Recording functions
  const startRecording = () => {
    if (recState === "recording") return;
    
    try {
      const canvas = canvasRef.current;
      const stream = canvas.captureStream(30);
      const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
      
      recordedChunksRef.current = [];
      
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `desktop-doc-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      
      mediaRecorderRef.current = mr;
      mr.start();
      setRecState("recording");
      
      setProgress(0);
      setIsPlaying(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = () => {
    if (recState !== "recording") return;
    
    const mr = mediaRecorderRef.current;
    if (mr) {
      mr.stop();
      setRecState("idle");
      setIsPlaying(false);
    }
  };

  // File drop handlers
  const handleFileDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onFiles(files);
  };

  const handleFileDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Effects
  useEffect(() => {
    setProgress((p) => (p >= Math.max(0, totalDuration - 1e-3) ? 0 : p));
  }, [timeline, totalDuration]);

  useEffect(() => {
    if (!isPlaying) return;
    
    const startedAt = performance.now() - progress * 1000;

    const tick = (now) => {
      try {
        const t = Math.max(0, (now - startedAt) / 1000);
        setProgress(Math.min(t, totalDuration));
        renderAtTime(t);
        
        if (t < totalDuration) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setIsPlaying(false);
        }
      } catch (error) {
        console.error('Error in playback tick:', error);
        setIsPlaying(false);
      }
    };
    
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, totalDuration, renderAtTime, progress]);

  useEffect(() => {
    if (!isPlaying) {
      renderAtTime(progress);
    }
  }, [progress, renderAtTime, isPlaying]);

  useEffect(() => {
    document.documentElement.lang = i18n.lang;
  }, [uiLang]);

  // Cleanup
  useEffect(() => {
    const videoMap = videoElementsRef.current;
    const imageMap = imageElementsRef.current;

    return () => {
      if (videoMap) {
        videoMap.forEach(video => {
          try {
            video.pause();
            video.src = '';
            video.remove();
          } catch {
            // ignore cleanup errors
          }
        });
        if (typeof videoMap.clear === 'function') videoMap.clear();
      }

      if (imageMap && typeof imageMap.clear === 'function') {
        imageMap.clear();
      }
    };
  }, []);

  // UI helpers
  const totalReadable = formatSeconds(totalDuration || 0);
  const progressReadable = formatSeconds(progress || 0);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Library */}
        <Card className="lg:col-span-2 shadow-xl rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Upload className="w-5 h-5" /> {i18n.t("mediaLibrary") || "Media Library"}
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{i18n.t("language") || "Language"}:</span>
                <button
                  className={`px-2 py-1 rounded-xl text-xs border ${i18n.lang==='tr'?'bg-black text-white':''}`}
                  onClick={() => { i18n.setLang('tr'); setUiLang(i18n.lang); }}
                >TR</button>
                <button
                  className={`px-2 py-1 rounded-xl text-xs border ${i18n.lang==='en'?'bg-black text-white':''}`}
                  onClick={() => { i18n.setLang('en'); setUiLang(i18n.lang); }}
                >EN</button>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="rounded-2xl">
                    {i18n.t("howItWorks") || "HOW IT WORKS?"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{i18n.t("guideTitle") || "DESKTOP DOCUMENTARY – QUICK GUIDE"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 text-sm">
                    <p>1. Drag and drop images/videos here.</p>
                    <p>2. Add each to the timeline.</p>
                    <p>3. Optionally add captions and set crossfade.</p>
                    <p>4. Preview with Play; Record to save as WebM.</p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div onDrop={handleFileDrop} onDragOver={handleFileDragOver} className="border-2 border-dashed rounded-2xl p-6 text-center bg-white">
              <p className="text-sm text-neutral-600">Drag files here or click to select.</p>
              <Input type="file" multiple accept="image/*,video/*" className="mt-3" onChange={(e) => onFiles(Array.from(e.target.files || []))}/>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              {library.map((item) => (
                <div key={item.id} className="border rounded-xl overflow-hidden bg-white">
                  <div className="aspect-video bg-neutral-100 flex items-center justify-center relative">
                    {item.type === "image" ? (
                      <img 
                        src={item.url} 
                        alt={item.file?.name || "Image"} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video 
                        src={item.url} 
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                    )}
                    
                    <Badge className="absolute top-2 left-2" variant="secondary">{item.type}</Badge>
                    {loadingStates[item.id] && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-xs flex items-center justify-between">
                    <span className="truncate">{item.file?.name || item.type}</span>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => addToTimeline(item.id)}>
                      <Plus className="w-4 h-4 mr-1"/> Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stage */}
        <Card className="lg:col-span-3 shadow-xl rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">STAGE & RECORD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="bg-black rounded-2xl overflow-hidden shadow-md">
                  <canvas ref={canvasRef} width={canvasSize.w} height={canvasSize.h} className="w-full h-auto block"/>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setIsPlaying((prev) => {
                        if (!prev) {
                          setProgress((p) => (p >= Math.max(0, totalDuration - 1e-3) ? 0 : p));
                        }
                        return !prev;
                      });
                    }}
                    className="rounded-2xl"
                    variant={isPlaying ? "secondary" : "default"}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 mr-1"/> : <Play className="w-4 h-4 mr-1"/>}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                  {recState !== "recording" ? (
                    <Button onClick={startRecording} className="rounded-2xl" variant="destructive">
                      <Circle className="w-4 h-4 mr-1"/> Record (WebM)
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} className="rounded-2xl" variant="secondary">
                      <StopCircle className="w-4 h-4 mr-1"/> Stop
                    </Button>
                  )}

                  <div className="ml-auto text-xs text-neutral-600">
                    {progressReadable} / {totalReadable}
                  </div>
                </div>
              </div>

              <div className="w-full md:w-72 space-y-4">
                <div className="p-3 bg-white rounded-2xl border">
                  <div className="text-xs font-semibold mb-2">Output Resolution</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { w: 1280, h: 720, label: "720p" },
                      { w: 1920, h: 1080, label: "1080p" },
                      { w: 1080, h: 1080, label: "1:1" },
                      { w: 1080, h: 1920, label: "9:16" },
                    ].map(({ w, h, label }) => (
                      <Button key={label} variant="outline" className="rounded-xl" onClick={() => setCanvasSize({ w, h })}>{label}</Button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-2xl border">
                  <div className="text-xs font-semibold mb-2">Crossfade (s)</div>
                  <Slider min={0} max={3} step={0.1} value={[crossfade]} onValueChange={([v]) => setCrossfade(v)}/>
                </div>

                <div className="p-3 bg-white rounded-2xl border space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <Palette className="w-4 h-4"/>
                    Cyberpunk Color Theme
                  </div>
                  <div className="flex gap-2 items-center">
                    {Object.entries(cyberColors).map(([colorKey, colorValue]) => (
                      <button
                        key={colorKey}
                        className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all duration-200 hover:scale-110 ${
                          selectedColor === colorKey 
                            ? 'border-white shadow-lg' 
                            : 'border-transparent hover:border-gray-300'
                        }`}
                        style={{ 
                          backgroundColor: colorValue.primary,
                          boxShadow: selectedColor === colorKey 
                            ? `0 0 15px ${colorValue.primary}` 
                            : 'none'
                        }}
                        onClick={() => setSelectedColor(colorKey)}
                        title={colorKey.toUpperCase()}
                      />
                    ))}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Selected: <span className="font-semibold" style={{ color: getCurrentColor().primary }}>
                      {selectedColor.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-2xl border space-y-2">
                  <div className="text-xs font-semibold">Global Title</div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Project title…" value={globalTitle} onChange={(e) => setGlobalTitle(e.target.value)} />
                    <Button size="sm" variant={showTitle ? "default" : "outline"} className="rounded-xl" onClick={() => setShowTitle((s) => !s)}>
                      <Type className="w-4 h-4"/>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="mt-6">
              <div className="text-sm font-semibold mb-2">TIMELINE</div>
              <div className="space-y-2">
                {timeline.length === 0 && (
                  <div className="text-xs text-neutral-500">No clips yet. Click "Add" in the library.</div>
                )}
                {timeline.map((clip, i) => {
                  const lib = library.find((l) => l.id === clip.libId);
                  
                  return (
                    <div key={clip.id} className="flex items-center gap-3 p-2 bg-white border rounded-xl">
                      <Badge variant="secondary">{i + 1}</Badge>
                      
                      <div className="w-12 h-8 rounded overflow-hidden bg-neutral-100 flex-shrink-0">
                        {lib?.type === "image" ? (
                          <img 
                            src={lib.url} 
                            alt="preview" 
                            className="w-full h-full object-cover"
                          />
                        ) : lib?.type === "video" ? (
                          <video 
                            src={lib.url} 
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-3 h-3 text-neutral-400" />
                          </div>
                        )}
                      </div>
                      
                      <div className="w-24 text-xs truncate">{lib?.file?.name || lib?.type}</div>
                      
                      {lib?.type === "image" ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span>Duration:</span>
                          <Slider
                            className="w-32"
                            min={0.05}
                            max={4}
                            step={0.05}
                            value={[Math.min(4, Math.max(0.05, clip.duration))]}
                            onValueChange={([v]) =>
                              setTimeline((t) =>
                                t.map((c) =>
                                  c.id === clip.id
                                    ? {
                                        ...c,
                                        duration: Math.min(4, Math.max(0.05, Math.round(v * 20) / 20)),
                                      }
                                    : c
                                )
                              )
                            }
                          />
                          <span className="w-12 text-right text-xs">
                            {Number((Math.min(4, Math.max(0.05, clip.duration))).toFixed(2))}s
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-500">
                          Video ({formatSeconds(lib?.duration || 0)})
                        </div>
                      )}
                      
                      <Input
                        className="ml-2 flex-1"
                        placeholder="Caption…"
                        value={clip.caption}
                        onChange={(e) => setTimeline((t) => t.map((c) => (c.id === clip.id ? { ...c, caption: e.target.value } : c)))}
                      />
                      
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="ml-auto hover:bg-red-50 hover:text-red-600" 
                        onClick={() => removeFromTimeline(clip.id)}
                      >
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

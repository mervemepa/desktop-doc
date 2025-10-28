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

  // Cyberpunk color theme state
  const [selectedColor, setSelectedColor] = useState("green");

  // 90s Terminal/CRT color palette - ensure this is defined properly
  const cyberColors = useMemo(() => ({
    green: { primary: "#00aa00", shadow: "#00aa00" },     // Classic terminal green
    amber: { primary: "#ffaa00", shadow: "#ffaa00" },     // Amber monitor
    red: { primary: "#cc0000", shadow: "#cc0000" },       // Dark red
    blue: { primary: "#0066cc", shadow: "#0066cc" },      // Dark blue
    purple: { primary: "#6600cc", shadow: "#6600cc" }     // Deep purple
  }), []);

  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const videoElementsRef = useRef(new Map());
  const imageElementsRef = useRef(new Map());
  const [uiLang, setUiLang] = useState(i18n.lang);
  

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

  // Get current color with fallback
  const getCurrentColor = useCallback(() => {
    return cyberColors[selectedColor] || cyberColors.green;
  }, [cyberColors, selectedColor]);

  // Utility functions - moved above their usage
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

  const wrapText = useCallback((ctx, text, x, y, maxWidth, lineHeight, fromBottom = false) => {
    const words = text.split(" ");
    let line = "";
    let yy = y;
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, yy);
        line = words[n] + " ";
        yy += fromBottom ? -lineHeight : lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, yy);
  }, []);

  // Add a new function for centered text wrapping
  const wrapTextCentered = useCallback((ctx, text, centerX, y, maxWidth, lineHeight) => {
    const words = text.split(" ");
    let line = "";
    let yy = y;
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line.trim(), centerX, yy);
        line = words[n] + " ";
        yy -= lineHeight; // Move up for next line (since we're going from bottom)
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), centerX, yy);
  }, []);

  // Improved image loading with error handling
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
      img.onerror = (error) => {
        console.error('Failed to load image:', src, error);
        reject(error);
      };
      img.crossOrigin = "anonymous";
      img.src = src;
    }), []);

  // Get or create video element for playback
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

  // Improved video probing with error handling
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

      const handleError = (error) => {
        console.error('Failed to load video metadata:', src, error);
        reject(error);
        cleanup();
      };

      const cleanup = () => {
        v.removeEventListener("loadedmetadata", handleLoadedMetadata);
        v.removeEventListener("error", handleError);
        v.remove();
      };

      v.addEventListener("loadedmetadata", handleLoadedMetadata);
      v.addEventListener("error", handleError);
      v.src = src;
    }), []);

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
      
      // Sync video time
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
    
    // Cyberpunk style title font
    ctx.font = "italic 900 42px 'Orbitron', 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    
    // Cyberpunk glow effect background
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const textWidth = ctx.measureText(text.toUpperCase()).width;
    ctx.fillRect(pad - 10, pad - 10, Math.min(textWidth + 20, maxWidth + 20), 60);
    
    // Cyberpunk neon glow effect
    ctx.fillStyle = currentColor.primary;
    ctx.shadowColor = currentColor.shadow;
    ctx.shadowBlur = 10;
    wrapText(ctx, text.toUpperCase(), pad, pad, maxWidth, 48);
    
    // Reset shadow
    ctx.shadowBlur = 0;
  }, [wrapText, getCurrentColor]);

  const drawCaption = useCallback((ctx, text, w, h) => {
    const pad = 60;
    const maxWidth = w - pad * 2;
    const currentColor = getCurrentColor();
    
    // Cyberpunk style caption font
    ctx.font = "italic 700 28px 'Orbitron', 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    
    // Darker background with slight neon edge
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    const metrics = ctx.measureText(text.toUpperCase());
    const boxW = Math.min(maxWidth, metrics.width + 40);
    const boxH = 44;
    
    // Center the background box
    const boxX = (w - boxW) / 2;
    ctx.fillRect(boxX, h - pad - boxH, boxW, boxH);
    
    // Add subtle neon border
    ctx.strokeStyle = currentColor.primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, h - pad - boxH, boxW, boxH);
    
    // Cyberpunk text with glow
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = currentColor.shadow;
    ctx.shadowBlur = 5;
    
    const textX = w / 2;
    wrapTextCentered(ctx, text.toUpperCase(), textX, h - pad - 12, maxWidth, 34);
    
    // Reset shadow
    ctx.shadowBlur = 0;
  }, [getCurrentColor, wrapTextCentered]);

  // Improved renderAtTime function
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

  // Handle dropped files with better error handling
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

  // Drag and drop reordering functions - simplified
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleTimelineDragStart = useCallback((e, clipId) => {
    setDraggedItem(clipId);
  }, []);

  const handleTimelineDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverIndex(null);
  }, []);

  const handleTimelineRowDragOver = useCallback((e, index) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleTimelineRowDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent parent elements from handling the drop
    
    if (!draggedItem) return;

    setTimeline((currentTimeline) => {
      const draggedIndex = currentTimeline.findIndex((clip) => clip.id === draggedItem);
      if (draggedIndex === -1) return currentTimeline;

      // If dropping in the same spot, do nothing
      if (draggedIndex === dropIndex || draggedIndex === dropIndex -1) {
        return currentTimeline;
      }

      const newTimeline = [...currentTimeline];
      const [draggedClip] = newTimeline.splice(draggedIndex, 1);
      
      // Adjust index if moving an item downwards
      const adjustedIndex = dropIndex > draggedIndex ? dropIndex - 1 : dropIndex;
      newTimeline.splice(adjustedIndex, 0, draggedClip);
      
      return newTimeline;
    });

    setDraggedItem(null);
    setDragOverIndex(null);
  }, [draggedItem]);

  // If timeline changes and playhead is at end, rewind to start
  useEffect(() => {
    setProgress((p) => (p >= Math.max(0, totalDuration - 1e-3) ? 0 : p));
  }, [timeline, totalDuration]);

  // Playback engine
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

  // Render when not playing
  useEffect(() => {
    if (!isPlaying) {
      renderAtTime(progress);
    }
  }, [progress, renderAtTime, isPlaying]);

  // Cleanup
  useEffect(() => {
    // Capture the current Map instances so the cleanup uses the same objects
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
            // ignore individual cleanup errors
          }
        });
        if (typeof videoMap.clear === 'function') videoMap.clear();
      }

      if (imageMap && typeof imageMap.clear === 'function') {
        imageMap.clear();
      }
    };
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
      
      mr.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        setRecState("idle");
      };
      
      mediaRecorderRef.current = mr;
      mr.start();
      setRecState("recording");
      
      // Reset progress to beginning and start playing
      setProgress(0);
      setIsPlaying(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = () => {
    if (recState !== "recording") return;
    
    try {
      mediaRecorderRef.current?.stop();
      setRecState("idle");
      setIsPlaying(false); // Also stop playback when recording stops
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  // File drop handlers (rename to avoid conflicts)
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

  // UI helpers
  const totalReadable = formatSeconds(totalDuration || 0);
  const progressReadable = formatSeconds(progress || 0);

  useEffect(() => {
    document.documentElement.lang = i18n.lang;
  }, [uiLang]);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Library */}
        <Card className="lg:col-span-2 shadow-xl rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Upload className="w-5 h-5" /> {i18n.t("mediaLibrary")}
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
                  <Button variant="secondary" className="rounded-2xl cyberpunk-font">
                    {i18n.t("howItWorks")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="cyberpunk-title">{i18n.t("guideTitle")}</DialogTitle>
                  </DialogHeader>
                  <ol className="list-decimal pl-6 space-y-2 text-sm leading-6">
                    {i18n.t("guideSteps").map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  <p className="text-xs text-neutral-500 mt-2">
                    {i18n.t("ffmpegHint")}
                  </p>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div onDrop={handleFileDrop} onDragOver={handleFileDragOver} className="border-2 border-dashed rounded-2xl p-6 text-center bg-white">
              <p className="text-sm text-neutral-600">{i18n.t("fileDropInstructions")}</p>
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
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : (
                      <video 
                        src={item.url} 
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                        onLoadedData={(e) => {
                          e.target.currentTime = 0.1;
                        }}
                      />
                    )}
                    
                    <div className="absolute inset-0 bg-neutral-100 flex items-center justify-center" style={{ display: 'none' }}>
                      {item.type === "image" ? (
                        <ImageIcon className="w-8 h-8 text-neutral-400"/>
                      ) : (
                        <Film className="w-8 h-8 text-neutral-400"/>
                      )}
                    </div>
                    
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
                      <Plus className="w-4 h-4 mr-1"/> {i18n.t("add")}
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
            <CardTitle className="text-xl cyberpunk-font">{i18n.t("stageAndRecord")}</CardTitle>
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
                    {isPlaying ? i18n.t("pause") : i18n.t("play")}
                  </Button>
                  {recState !== "recording" ? (
                    <Button onClick={startRecording} className="rounded-2xl" variant="destructive">
                      <Circle className="w-4 h-4 mr-1"/> {i18n.t("recordWebM")}
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} className="rounded-2xl" variant="secondary">
                      <StopCircle className="w-4 h-4 mr-1"/> {i18n.t("stop")}
                    </Button>
                  )}

                  <div className="ml-auto text-xs text-neutral-600">
                    {progressReadable} / {totalReadable}
                  </div>
                </div>
              </div>

              <div className="w-full md:w-72 space-y-4">
                <div className="p-3 bg-white rounded-2xl border">
                  <div className="text-xs font-semibold mb-2">{i18n.t("outputResolution")}</div>
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
                  <div className="text-xs font-semibold mb-2">{i18n.t("crossfadeSeconds")}</div>
                  <Slider min={0} max={3} step={0.1} value={[crossfade]} onValueChange={([v]) => setCrossfade(v)}/>
                </div>

                {/* Color Theme Picker */}
                <div className="p-3 bg-white rounded-2xl border space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <Palette className="w-4 h-4"/>
                    {i18n.t("themeHeading")}
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
                    {i18n.t("selected")}: <span className="font-semibold" style={{ color: getCurrentColor().primary }}>
                      {selectedColor.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-2xl border space-y-2">
                  <div className="text-xs font-semibold">{i18n.t("globalTitleLabel")}</div>
                  <div className="flex items-center gap-2">
                    <Input placeholder={i18n.t("projectTitlePlaceholder")} value={globalTitle} onChange={(e) => setGlobalTitle(e.target.value)} />
                    <Button size="sm" variant={showTitle ? "default" : "outline"} className="rounded-xl" onClick={() => setShowTitle((s) => !s)}>
                      <Type className="w-4 h-4"/>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline with cyberpunk styling */}
            <div className="mt-6">
              <div className="text-sm font-semibold mb-2 flex items-center gap-2 cyberpunk-font">
                {i18n.t("timeline")}
                {timeline.length > 0 && (
                  <span className="text-xs text-neutral-500 normal-case">
                    {i18n.t("timelineReorderHint")}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {timeline.length === 0 && (
                  <div className="text-xs text-neutral-500">{i18n.t("timelineEmpty")}</div>
                )}
                {timeline.map((clip, i) => {
                  const lib = library.find((l) => l.id === clip.libId);
                  const isDragging = draggedItem === clip.id;
                  const isDropTarget = dragOverIndex === i;
                  
                  return (
                    <div key={clip.id}>
                      {isDropTarget && draggedItem !== clip.id && (
                        <div className="h-1 bg-blue-500 rounded-full mx-2 mb-2 opacity-75"></div>
                      )}
                      
                      <div 
                        onDragOver={(e) => handleTimelineRowDragOver(e, i)}
                        onDrop={(e) => handleTimelineRowDrop(e, i)}
                        className={`flex items-center gap-3 p-2 bg-white border rounded-xl transition-all duration-200 ${
                          isDragging ? 'opacity-50' : ''
                        } hover:shadow-md`}
                      >
                        <div
                          draggable
                          onDragStart={(e) => handleTimelineDragStart(e, clip.id)}
                          onDragEnd={handleTimelineDragEnd}
                          className="flex items-center text-neutral-400 hover:text-neutral-600 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                        
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
                            <span>{i18n.t("duration")}:</span>
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
                              onPointerDown={(e) => e.stopPropagation()}
                            />
                            <span className="w-12 text-right text-xs">
                              {Number((Math.min(4, Math.max(0.05, clip.duration))).toFixed(2))}s
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-neutral-500">
                            {i18n.t("videoLabel")} ({formatSeconds(lib?.duration || 0)})
                          </div>
                        )}
                        
                        <Input
                          className="ml-2 flex-1"
                          placeholder={i18n.t("captionPlaceholder")}
                          value={clip.caption}
                          onChange={(e) => setTimeline((t) => t.map((c) => (c.id === clip.id ? { ...c, caption: e.target.value } : c)))}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                        
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="ml-auto hover:bg-red-50 hover:text-red-600" 
                          onClick={() => removeFromTimeline(clip.id)}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-4 h-4"/>
                        </Button>
                      </div>
                    </div>
                  );
                })}
                
                {timeline.length > 0 && (
                  <div
                    className={`mt-2 h-10 border-2 border-dashed rounded-xl flex items-center justify-center text-xs ${
                      dragOverIndex === timeline.length ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-neutral-300 text-neutral-500'
                    }`}
                    onDragOver={(e) => handleTimelineRowDragOver(e, timeline.length)}
                    onDrop={(e) => handleTimelineRowDrop(e, timeline.length)}
                  >
                    {i18n.t("dropHere")}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { removeBackground } from '@imgly/background-removal';

const SLIDERS = [
  { id: 's0', vid: 'v0', def: 100, suf: '', name: 'Brillo', max: 200, min: 0 },
  { id: 's1', vid: 'v1', def: 100, suf: '', name: 'Contraste', max: 200, min: 0 },
  { id: 's2', vid: 'v2', def: 100, suf: '', name: 'Saturación', max: 300, min: 0 },
  { id: 's3', vid: 'v3', def: 0, suf: '°', name: 'Tono (Hue)', max: 360, min: 0 },
  { id: 's4', vid: 'v4', def: 0, suf: '', name: 'Desenfoque', max: 20, min: 0 },
  { id: 's5', vid: 'v5', def: 0, suf: '', name: 'Sepia', max: 100, min: 0 },
  { id: 's6', vid: 'v6', def: 100, suf: '', name: 'Opacidad', max: 100, min: 10 },
];

const PRESETS: Record<string, any> = {
  vintage: { s0: 95, s1: 90, s2: 70, s3: 15, s4: 0, s5: 35, s6: 100 },
  cine: { s0: 88, s1: 130, s2: 80, s3: 5, s4: 0, s5: 10, s6: 100 },
  vivid: { s0: 105, s1: 120, s2: 200, s3: 0, s4: 0, s5: 0, s6: 100 },
  cool: { s0: 100, s1: 105, s2: 90, s3: 200, s4: 0, s5: 0, s6: 100 },
  warm: { s0: 108, s1: 105, s2: 120, s3: 340, s4: 0, s5: 15, s6: 100 },
  dream: { s0: 115, s1: 85, s2: 140, s3: 270, s4: 2, s5: 5, s6: 90 },
  neon: { s0: 110, s1: 140, s2: 280, s3: 180, s4: 0, s5: 0, s6: 100 },
  fade: { s0: 120, s1: 75, s2: 60, s3: 0, s4: 1, s5: 20, s6: 85 },
};

const AI_PROMPTS: Record<string, string> = {
  describe: 'Describe esta imagen detalladamente: sujetos, colores, composición, ambiente y cualquier elemento interesante que observes.',
  enhance: 'Analiza la imagen y sugiere los valores exactos para mejorarla profesionalmente. Aplica los ajustes recomendados.',
  colors: 'Analiza la paleta de colores dominante. ¿Qué colores destacan? ¿Qué armonía tiene? ¿Cómo mejorarla cromáticamente?',
  suggest: 'Basándote en el contenido de la imagen, sugiere los mejores ajustes para una presentación profesional y aplícalos.',
  caption: 'Genera 3 captions creativos para redes sociales (Instagram, LinkedIn, Twitter) basados en esta imagen. Incluye hashtags relevantes.',
  alt: 'Genera un texto alternativo (alt text) descriptivo y accesible para esta imagen, siguiendo las buenas prácticas de accesibilidad web.',
  bg: 'Analiza el contenido de la imagen y sugiere 3 tipos de fondo que combinarían perfectamente: colores específicos, degradados o ambiente.',
  style: 'Sugiere 3 estilos artísticos o fotográficos que aplicarían bien a esta imagen (ej: cinematográfico, editorial, minimalista) con los ajustes exactos para cada uno.',
};

export default function PixelatePro() {
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grayActive, setGrayActive] = useState(false);
  const [invertActive, setInvertActive] = useState(false);
  const [currentBg, setCurrentBg] = useState('transparent');
  const [historyItems, setHistoryItems] = useState<{ src: string }[]>([]);

  const [adj, setAdj] = useState<Record<string, number>>({
    s0: 100, s1: 100, s2: 100, s3: 0, s4: 0, s5: 0, s6: 100
  });

  const [geminiKey, setGeminiKey] = useState('');
  const [removeBgKey, setRemoveBgKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini');
  const [imageEditModel, setImageEditModel] = useState<'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview'>('gemini-3.1-flash-image-preview');
  const [lastMagicPrompt, setLastMagicPrompt] = useState('');

  const [activeTab, setActiveTab] = useState<'edit' | 'bg' | 'hist' | 'enhance'>('edit');
  const [activeTool, setActiveTool] = useState('select');
  const [activePreset, setActivePreset] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string, type: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [bgStatus, setBgStatus] = useState<{ msg: string, type: 'success' | 'error' | 'loading' | '' } | null>(null);
  const [imgMeta, setImgMeta] = useState<{ name: string, size: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string, isThinking?: boolean }[]>([
    { role: 'ai', text: '¡Hola! Soy tu asistente de edición inteligente impulsado por <strong>Gemini Flash</strong> (gratis). 🎉<br><br>Para empezar:<br>1️⃣ Obtén tu API key gratuita de Gemini en <strong>aistudio.google.com</strong><br>2️⃣ Pégala en el campo "Gemini" arriba<br>3️⃣ Sube tu imagen y dime qué necesitas<br><br>También puedo <strong>eliminar y cambiar fondos</strong> con IA. ✦' }
  ]);
  const [userInput, setUserInput] = useState('');

  const imgRef = useRef<HTMLImageElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgImgInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (key && !geminiKey) {
      setGeminiKey(key);
    }
  }, [geminiKey]);

  const showToast = (msg: string, type: string = '') => {
    setToast({ msg, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  const renderBg = useCallback(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentBg === 'transparent') return;

    if (currentBg.startsWith('url(')) {
      const url = currentBg.slice(4, -1).replace(/"/g, '');
      const bImg = new Image();
      bImg.onload = () => {
        ctx.drawImage(bImg, 0, 0, canvas.width, canvas.height);
      };
      bImg.src = url;
    } else if (currentBg.startsWith('linear-gradient')) {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      const colors = currentBg.match(/#[0-9a-fA-F]{3,6}/g) || [];
      if (colors.length >= 2 && colors[0] && colors[colors.length - 1]) {
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[colors.length - 1]);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = currentBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [currentBg]);

  const syncBgCanvas = useCallback(() => {
    const img = imgRef.current;
    const bgc = bgCanvasRef.current;
    if (!img || !bgc || !img.naturalWidth) return;
    bgc.width = img.naturalWidth;
    bgc.height = img.naturalHeight;
    bgc.style.width = img.offsetWidth + 'px';
    bgc.style.height = img.offsetHeight + 'px';
    renderBg();
  }, [renderBg]);

  useEffect(() => {
    window.addEventListener('resize', syncBgCanvas);
    return () => window.removeEventListener('resize', syncBgCanvas);
  }, [syncBgCanvas]);

  const loadImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { showToast('Imagen muy grande (máx 15MB)', 'err'); return; }
    const r = new FileReader();
    r.onload = ev => {
      const result = ev.target?.result as string;
      setOriginalSrc(result);
      setCurrentSrc(result);
      setBgRemoved(false);
      setRotation(0);
      setFlipped(false);
      setGrayActive(false);
      setInvertActive(false);
      setImgMeta({ name: f.name, size: (f.size / 1024).toFixed(0) + 'KB' });
      setBgStatus(null);
      setMessages(prev => [...prev, { role: 'ai', text: `Imagen "${f.name}" cargada. ¿Qué te gustaría hacer? Puedo describirla, mejorarla, eliminar el fondo o sugerir ajustes.` }]);
    };
    r.readAsDataURL(f);
    e.target.value = '';
  };

  const clearAll = () => {
    setOriginalSrc(null);
    setCurrentSrc(null);
    setBgRemoved(false);
    setRotation(0);
    setFlipped(false);
    setGrayActive(false);
    setInvertActive(false);
    setCurrentBg('transparent');
    setImgMeta(null);
    resetSliders();
  };

  const resetSliders = () => {
    setAdj({ s0: 100, s1: 100, s2: 100, s3: 0, s4: 0, s5: 0, s6: 100 });
    setGrayActive(false);
    setInvertActive(false);
    setActivePreset('');
  };

  const resetAll = () => {
    setRotation(0);
    setFlipped(false);
    resetSliders();
    showToast('Ajustes restablecidos', 'ok');
  };

  const resizeImageForAI = (dataUrl: string, maxW = 1024, maxH = 1024): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          if (w > h) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          } else {
            w = Math.round((w * maxH) / h);
            h = maxH;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = dataUrl;
    });
  };

  const applyPreset = (name: string) => {
    setActivePreset(name);
    setAdj({ ...PRESETS[name] });
    showToast(`Preset "${name}" aplicado`, 'ok');
  };

  const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  };

  const removeBgAPI = async (key: string) => {
    setBgStatus({ msg: 'Eliminando fondo con Remove.bg...', type: 'loading' });
    setIsLoading(true);
    try {
      const b64 = originalSrc!.split(',')[1];
      const fd = new FormData();
      fd.append('image_file_b64', b64);
      fd.append('size', 'auto');

      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': key },
        body: fd
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.errors?.[0]?.title || 'Error Remove.bg');
      }

      const blob = await res.blob();
      const dataUrl = await blobToDataURL(blob);
      setCurrentSrc(dataUrl);
      setBgRemoved(true);
      setBgStatus({ msg: '✓ Fondo eliminado correctamente', type: 'success' });
      showToast('Fondo eliminado con Remove.bg ✓', 'ok');
      setMessages(prev => [...prev, { role: 'ai', text: 'Fondo eliminado con Remove.bg. Ahora puedes elegir un color o imagen de fondo en la pestaña "Fondo".' }]);
    } catch (e: any) {
      setBgStatus({ msg: 'Error: ' + e.message + '. Intentando método alternativo...', type: 'error' });
      await removeBgCanvas();
    }
    setIsLoading(false);
  };

  const removeBgCanvas = async () => {
    setBgStatus({ msg: 'Procesando con IA local (puede tardar unos segundos)...', type: 'loading' });
    setIsLoading(true);

    try {
      const blob = await removeBackground(originalSrc!);
      const dataUrl = await blobToDataURL(blob);

      setCurrentSrc(dataUrl);
      setBgRemoved(true);
      setBgStatus({ msg: '✓ Fondo eliminado con IA local', type: 'success' });
      showToast('Fondo eliminado ✓', 'ok');
      setMessages(prev => [...prev, { role: 'ai', text: 'Fondo eliminado con éxito usando IA local. Ahora puedes elegir un color o imagen de fondo en la pestaña "Fondo".' }]);
    } catch (e: any) {
      console.error(e);
      setBgStatus({ msg: 'Error procesando la imagen', type: 'error' });
      showToast('Error al eliminar fondo', 'err');
    }
    setIsLoading(false);
  };

  const enhanceImage = async (type: 'upscale2x' | 'upscale4x' | 'sharpen' | 'denoise' | 'magic') => {
    if (!currentSrc) { showToast('Primero carga una imagen', 'err'); return; }
    setIsLoading(true);
    setBgStatus({ msg: `Aplicando mejora...`, type: 'loading' });

    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = currentSrc; });

      const c = document.createElement('canvas');
      const ctx = c.getContext('2d')!;

      if (type === 'upscale2x' || type === 'upscale4x') {
        const scale = type === 'upscale2x' ? 2 : 4;
        c.width = img.width * scale;
        c.height = img.height * scale;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
      } else if (type === 'sharpen' || type === 'magic') {
        c.width = img.width;
        c.height = img.height;
        
        if (type === 'magic') {
          ctx.filter = 'contrast(1.1) saturate(1.2) brightness(1.05)';
        }
        
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ctx.filter = 'none';
        
        const imageData = ctx.getImageData(0, 0, c.width, c.height);
        const data = imageData.data;
        const w = c.width;
        const h = c.height;
        
        // Sharpen kernel
        const kernel = type === 'magic' ? [
           0, -0.2,  0,
          -0.2,  1.8, -0.2,
           0, -0.2,  0
        ] : [
           0, -1,  0,
          -1,  5, -1,
           0, -1,  0
        ];
        
        const side = Math.round(Math.sqrt(kernel.length));
        const halfSide = Math.floor(side / 2);
        const src = new Uint8ClampedArray(data);
        const sw = w;
        const sh = h;
        
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dstOff = (y * w + x) * 4;
            let r = 0, g = 0, b = 0;
            for (let cy = 0; cy < side; cy++) {
              for (let cx = 0; cx < side; cx++) {
                const scy = y + cy - halfSide;
                const scx = x + cx - halfSide;
                if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
                  const srcOff = (scy * sw + scx) * 4;
                  const wt = kernel[cy * side + cx];
                  r += src[srcOff] * wt;
                  g += src[srcOff + 1] * wt;
                  b += src[srcOff + 2] * wt;
                }
              }
            }
            data[dstOff] = Math.min(255, Math.max(0, r));
            data[dstOff + 1] = Math.min(255, Math.max(0, g));
            data[dstOff + 2] = Math.min(255, Math.max(0, b));
          }
        }
        ctx.putImageData(imageData, 0, 0);
      } else if (type === 'denoise') {
        c.width = img.width;
        c.height = img.height;
        ctx.filter = 'blur(1px)';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ctx.filter = 'none';
      }

      const dataUrl = c.toDataURL('image/png');
      setCurrentSrc(dataUrl);
      
      setHistoryItems(prev => {
        const newH = [...prev, { src: dataUrl }];
        if (newH.length > 10) newH.shift();
        return newH;
      });

      setBgStatus({ msg: '✓ Mejora aplicada', type: 'success' });
      showToast('Calidad mejorada ✓', 'ok');
      setMessages(prev => [...prev, { role: 'ai', text: `He aplicado la mejora de calidad a tu imagen.` }]);
    } catch (e) {
      console.error(e);
      setBgStatus({ msg: 'Error al mejorar la imagen', type: 'error' });
      showToast('Error al mejorar', 'err');
    }
    setIsLoading(false);
  };

  const removeBg = async () => {
    if (!originalSrc) { showToast('Primero carga una imagen', 'err'); return; }
    if (removeBgKey.trim()) {
      await removeBgAPI(removeBgKey.trim());
    } else {
      await removeBgCanvas();
    }
  };

  const restoreOriginal = () => {
    if (!originalSrc) return;
    setCurrentSrc(originalSrc);
    setBgRemoved(false);
    setBgStatus(null);
    showToast('Imagen original restaurada', 'ok');
  };

  const loadBgImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setCurrentBg(`url("${dataUrl}")`);
      showToast('Imagen de fondo cargada', 'ok');
    };
    r.readAsDataURL(f);
    e.target.value = '';
  };

  const blurBg = () => {
    if (!originalSrc) { showToast('Primero carga una imagen', 'err'); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.filter = 'blur(16px) brightness(0.7)';
      ctx.drawImage(img, 0, 0);
      setCurrentBg(`url("${c.toDataURL()}")`);
      showToast('Fondo desenfocado aplicado', 'ok');
    };
    img.src = originalSrc;
  };

  const downloadResult = () => {
    const img = imgRef.current;
    const bgc = bgCanvasRef.current;
    if (!img || !img.src || !bgc) return;

    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 800;
    c.height = img.naturalHeight || 600;
    const ctx = c.getContext('2d')!;

    if (bgc.width > 0) {
      ctx.drawImage(bgc, 0, 0, c.width, c.height);
    }

    ctx.filter = img.style.filter || 'none';
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(flipped ? -1 : 1, 1);
    ctx.drawImage(img, -c.width / 2, -c.height / 2, c.width, c.height);
    ctx.restore();

    const a = document.createElement('a');
    a.download = `pixelate-pro-${Date.now()}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
    showToast('Imagen descargada ✓', 'ok');
  };

  const saveToHistory = () => {
    if (!currentSrc) { showToast('Sin imagen para guardar', 'err'); return; }
    setHistoryItems(prev => {
      const newItems = [{ src: currentSrc }, ...prev];
      if (newItems.length > 12) newItems.pop();
      return newItems;
    });
    showToast('Estado guardado en historial', 'ok');
  };

  const callGemini = async (userPrompt: string, includeImage = true) => {
    const key = geminiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!key) { showToast('Ingresa tu API key de Gemini (¡es gratis!)', 'err'); return null; }

    const ai = new GoogleGenAI({ apiKey: key });
    const systemCtx = `Eres Pixelate PRO, un asistente experto en edición de imágenes y diseño visual.
Ayudas a los usuarios a mejorar sus imágenes con sugerencias específicas.
Puedes ejecutar comandos directamente en la aplicación devolviendo un bloque JSON dentro de la etiqueta <comandos>.
Ejemplos de comandos:
- Para ajustar valores (brillo s0, contraste s1, saturacion s2, hue s3, blur s4, sepia s5, opacidad s6): <comandos>[{"action":"adjust","values":{"s0":120,"s1":110}}]</comandos>
- Para eliminar el fondo: <comandos>[{"action":"remove_bg"}]</comandos>
- Para cambiar el color de fondo (usa hex o degradado): <comandos>[{"action":"set_bg_color","color":"#ff0000"}]</comandos>
- Para aplicar mejora mágica u otras (upscale2x, upscale4x, sharpen, denoise, magic): <comandos>[{"action":"enhance","type":"magic"}]</comandos>
- Para aplicar filtros predefinidos (vintage, cine, vivid, cool, warm, dream, neon, fade): <comandos>[{"action":"preset","id":"vintage"}]</comandos>
Puedes combinar comandos en el array.
Responde siempre en español, de forma clara, amigable y concisa (máx 4 oraciones). No menciones el bloque JSON en tu texto.`;

    const parts: any[] = [];

    if (includeImage && currentSrc) {
      const b64 = currentSrc.includes(',') ? currentSrc.split(',')[1] : currentSrc;
      const mimeM = currentSrc.match(/data:([^;]+);/);
      const mime = mimeM ? mimeM[1] : 'image/jpeg';
      parts.push({ inlineData: { mimeType: mime, data: b64 } });
    }

    parts.push({ text: userPrompt });

    try {
      const response = await ai.models.generateContent({
        model: aiModel === 'gemini-pro' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview',
        contents: parts,
        config: {
          systemInstruction: systemCtx,
          temperature: 0.7,
          maxOutputTokens: 800,
        }
      });
      return response.text || 'Sin respuesta';
    } catch (e: any) {
      throw new Error(e.message || 'Error Gemini API');
    }
  };

  const editImageWithGemini = async (prompt: string, modelOverride?: typeof imageEditModel) => {
    const key = geminiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!key) { showToast('Ingresa tu API key de Gemini (¡es gratis!)', 'err'); return; }
    if (!currentSrc) { showToast('Primero carga una imagen', 'err'); return; }

    setLastMagicPrompt(prompt);
    const modelToUse = modelOverride || imageEditModel;
    setIsLoading(true);
    setBgStatus({ msg: `Optimizando imagen para IA...`, type: 'loading' });

    try {
      const optimizedSrc = await resizeImageForAI(currentSrc);
      setBgStatus({ msg: `Editando con ${modelToUse === 'gemini-2.5-flash-image' ? 'G 2.5' : 'G 3.1'}...`, type: 'loading' });
      
      const ai = new GoogleGenAI({ apiKey: key });
      const b64 = optimizedSrc.split(',')[1];
      const mime = 'image/jpeg';

      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: {
          parts: [
            { inlineData: { data: b64, mimeType: mime } },
            { text: prompt },
          ],
        },
      });

      let newImageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          newImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (newImageUrl) {
        setCurrentSrc(newImageUrl);
        setHistoryItems(prev => {
          const newH = [{ src: newImageUrl }, ...prev];
          if (newH.length > 12) newH.pop();
          return newH;
        });
        showToast('Imagen editada con éxito', 'ok');
      } else {
        showToast('La IA no devolvió una imagen válida', 'err');
      }
    } catch (e: any) {
      console.error(e);
      let errorMsg = 'Error al editar imagen: ' + e.message;
      if (e.message?.includes('429') || e.message?.includes('Quota exceeded') || e.message?.includes('RESOURCE_EXHAUSTED')) {
        const otherModel = modelToUse === 'gemini-2.5-flash-image' ? 'gemini-3.1-flash-image-preview' : 'gemini-2.5-flash-image';
        const otherModelName = otherModel === 'gemini-2.5-flash-image' ? 'Gemini 2.5' : 'Gemini 3.1';
        errorMsg = `Límite de cuota excedido para ${modelToUse === 'gemini-2.5-flash-image' ? 'G 2.5' : 'G 3.1'}.`;
        
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: `⚠️ <strong>Límite de cuota alcanzado</strong> en el modelo actual.<br><br>El nivel gratuito de Gemini tiene límites estrictos. ¿Quieres intentar con el otro modelo gratuito?<br><br><button class="px-3 py-1.5 bg-brand-purple rounded-lg text-white text-xs font-bold mt-2 hover:bg-brand-purple-dark transition-all" onclick="window.retryMagicEdit('${otherModel}')">Reintentar con ${otherModelName}</button>` 
        }]);
      }
      showToast(errorMsg, 'err');
    } finally {
      setIsLoading(false);
      setBgStatus(null);
    }
  };

  // Expose retry function to window for the HTML button in chat
  useEffect(() => {
    (window as any).retryMagicEdit = (model: any) => {
      setImageEditModel(model);
      if (lastMagicPrompt) editImageWithGemini(lastMagicPrompt, model);
    };
  }, [lastMagicPrompt]);

  const executeAICommands = async (text: string) => {
    let cleanText = text;
    let commandsExecuted = false;

    // Handle old <ajustes> format for backwards compatibility
    const m1 = text.match(/<ajustes>([\s\S]*?)<\/ajustes>/);
    if (m1) {
      try {
        const vals = JSON.parse(m1[1]);
        setAdj(prev => ({ ...prev, ...vals }));
        commandsExecuted = true;
      } catch (e) { }
      cleanText = cleanText.replace(/<ajustes>[\s\S]*?<\/ajustes>/, '').trim();
    }

    // Handle new <comandos> format
    const m2 = text.match(/<comandos>([\s\S]*?)<\/comandos>/);
    if (m2) {
      try {
        const cmds = JSON.parse(m2[1]);
        for (const cmd of cmds) {
          if (cmd.action === 'adjust' && cmd.values) {
            setAdj(prev => ({ ...prev, ...cmd.values }));
            commandsExecuted = true;
          } else if (cmd.action === 'remove_bg') {
            await removeBg();
            commandsExecuted = true;
          } else if (cmd.action === 'set_bg_color' && cmd.color) {
            setCurrentBg(cmd.color);
            commandsExecuted = true;
          } else if (cmd.action === 'enhance' && cmd.type) {
            await enhanceImage(cmd.type);
            commandsExecuted = true;
          } else if (cmd.action === 'preset' && cmd.id) {
            applyPreset(cmd.id);
            commandsExecuted = true;
          }
        }
      } catch (e) { console.error('Error parsing commands', e); }
      cleanText = cleanText.replace(/<comandos>[\s\S]*?<\/comandos>/, '').trim();
    }

    if (commandsExecuted) {
      showToast('Comandos IA aplicados ✓', 'ok');
    }

    return cleanText;
  };

  const sendMsg = async (textOverride?: string) => {
    const txt = textOverride || userInput.trim();
    if (!txt) return;
    setUserInput('');
    setMessages(prev => [...prev, { role: 'user', text: txt }]);
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'ai', text: '', isThinking: true }]);

    try {
      const reply = await callGemini(txt);
      if (reply) {
        const clean = await executeAICommands(reply);
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { role: 'ai', text: clean };
          return newMsgs;
        });
      } else {
        setMessages(prev => prev.slice(0, -1)); // Remove thinking msg
      }
    } catch (e: any) {
      let errorMsg = 'Error: ' + e.message;
      if (e.message?.includes('429') || e.message?.includes('Quota exceeded') || e.message?.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = 'Has superado el límite de uso gratuito de la IA. Por favor, espera unos minutos o intenta con otra API key.';
      }
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { role: 'ai', text: errorMsg };
        return newMsgs;
      });
      showToast(errorMsg, 'err');
    }
    setIsLoading(false);
  };

  const aiDo = async (action: string) => {
    if (!currentSrc && action !== 'suggest') {
      showToast('Primero carga una imagen', 'err'); return;
    }
    await sendMsg(AI_PROMPTS[action]);
  };

  const filterStyle = `brightness(${adj.s0}%) contrast(${adj.s1}%) saturate(${adj.s2}%) hue-rotate(${adj.s3}deg) blur(${adj.s4}px) sepia(${adj.s5}%) opacity(${adj.s6}%) ${grayActive ? 'grayscale(100%)' : ''} ${invertActive ? 'invert(100%)' : ''}`;
  const transformStyle = `rotate(${rotation}deg) scaleX(${flipped ? -1 : 1})`;

  return (
    <>
      <header className="h-[58px] flex items-center justify-between px-6 border-b border-border-light bg-[#08080e]/97 backdrop-blur-md sticky top-0 z-[200] gap-4 flex-wrap">
        <div className="font-syne text-[19px] font-extrabold bg-gradient-to-br from-brand-purple to-brand-teal bg-clip-text text-transparent flex items-center gap-2 whitespace-nowrap">
          <div className="w-[30px] h-[30px] rounded-[7px] bg-gradient-to-br from-brand-purple to-brand-teal flex items-center justify-center text-[15px] shrink-0 text-white">✦</div>
          Pixelate PRO
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-[7px] bg-bg-element border border-border-light rounded-lg px-2.5 py-1.5 min-w-0">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${geminiKey.length > 10 ? 'bg-brand-teal shadow-[0_0_6px_var(--color-brand-teal)]' : 'bg-[#333]'}`}></div>
            <label className="text-[11px] text-text-dark font-medium whitespace-nowrap">Gemini:</label>
            <input
              type="password"
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              className="bg-transparent border-none outline-none text-text-muted text-xs w-[170px] font-mono placeholder:text-text-dark"
            />
          </div>
          <div className="flex items-center gap-[7px] bg-bg-element border border-border-light rounded-lg px-2.5 py-1.5 min-w-0">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${removeBgKey.length > 5 ? 'bg-brand-teal shadow-[0_0_6px_var(--color-brand-teal)]' : 'bg-[#333]'}`}></div>
            <label className="text-[11px] text-text-dark font-medium whitespace-nowrap">Remove.bg:</label>
            <input
              type="password"
              value={removeBgKey}
              onChange={e => setRemoveBgKey(e.target.value)}
              placeholder="(opcional)"
              className="bg-transparent border-none outline-none text-text-muted text-xs w-[170px] font-mono placeholder:text-text-dark"
            />
          </div>
          <button onClick={() => setShowHelp(true)} className="px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap bg-transparent border border-border-med text-text-muted hover:border-brand-purple hover:text-brand-purple">
            ❓ Cómo obtener las keys
          </button>
        </div>
      </header>

      <div className={`h-[2px] bg-gradient-to-r from-brand-purple via-brand-teal to-brand-purple bg-[length:200%] animate-[prog_1.2s_linear_infinite] shrink-0 ${isLoading ? 'block' : 'hidden'}`}></div>

      <div className="grid grid-cols-[1fr] md:grid-cols-[220px_1fr] lg:grid-cols-[250px_1fr_300px] flex-1 min-h-[calc(100vh-58px)]">

        {/* LEFT PANEL */}
        <div className="hidden md:flex bg-bg-panel border-r border-border-light flex-col overflow-hidden">
          <div className="p-3.5 flex-col gap-5 overflow-y-auto flex-1 flex">
            <div>
              <div className="flex bg-bg-element rounded-lg p-[3px] gap-[2px] border border-border-light">
                <button className={`flex-1 py-1.5 px-1 rounded-md text-[11px] font-medium text-center cursor-pointer transition-colors border-none ${activeTab === 'edit' ? 'bg-brand-purple-dark text-white' : 'bg-transparent text-text-dark hover:text-text-muted'}`} onClick={() => setActiveTab('edit')}>✏ Edición</button>
                <button className={`flex-1 py-1.5 px-1 rounded-md text-[11px] font-medium text-center cursor-pointer transition-colors border-none ${activeTab === 'bg' ? 'bg-brand-purple-dark text-white' : 'bg-transparent text-text-dark hover:text-text-muted'}`} onClick={() => setActiveTab('bg')}>🖼 Fondo</button>
                <button className={`flex-1 py-1.5 px-1 rounded-md text-[11px] font-medium text-center cursor-pointer transition-colors border-none ${activeTab === 'enhance' ? 'bg-brand-purple-dark text-white' : 'bg-transparent text-text-dark hover:text-text-muted'}`} onClick={() => setActiveTab('enhance')}>✨ Calidad</button>
                <button className={`flex-1 py-1.5 px-1 rounded-md text-[11px] font-medium text-center cursor-pointer transition-colors border-none ${activeTab === 'hist' ? 'bg-brand-purple-dark text-white' : 'bg-transparent text-text-dark hover:text-text-muted'}`} onClick={() => setActiveTab('hist')}>🕒 Historial</button>
              </div>
            </div>

          {activeTab === 'edit' && (
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Herramientas</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-colors text-[10px] ${activeTool === 'select' ? 'border-brand-purple text-[#c0baff] bg-brand-purple-light' : 'border-border-light bg-bg-element text-text-dark hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light'}`} onClick={() => setActiveTool('select')}><span className="text-[17px]">↖</span>Selec.</button>
                  <button className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-colors text-[10px] border-border-light bg-bg-element text-text-dark hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light`} onClick={() => { setActiveTool('rotate'); setRotation(r => (r + 90) % 360); }}><span className="text-[17px]">↻</span>Rotar</button>
                  <button className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-colors text-[10px] border-border-light bg-bg-element text-text-dark hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light`} onClick={() => { setActiveTool('flip'); setFlipped(f => !f); }}><span className="text-[17px]">⇄</span>Voltear</button>
                  <button className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-colors text-[10px] ${grayActive ? 'border-brand-purple text-[#c0baff] bg-brand-purple-light' : 'border-border-light bg-bg-element text-text-dark hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light'}`} onClick={() => { setActiveTool('gray'); setGrayActive(g => !g); showToast(!grayActive ? 'Escala de grises activada' : 'Escala de grises desactivada'); }}><span className="text-[17px]">◑</span>Gris</button>
                  <button className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-colors text-[10px] ${invertActive ? 'border-brand-purple text-[#c0baff] bg-brand-purple-light' : 'border-border-light bg-bg-element text-text-dark hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light'}`} onClick={() => { setActiveTool('invert'); setInvertActive(i => !i); }}><span className="text-[17px]">◐</span>Invertir</button>
                  <button className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-colors text-[10px] border-border-light bg-bg-element text-text-dark hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light`} onClick={resetAll}><span className="text-[17px]">↺</span>Reset</button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Ajustes</div>
                <div className="flex flex-col gap-[11px]">
                  {SLIDERS.map(s => (
                    <div key={s.id} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] text-text-muted">
                        <span>{s.name}</span>
                        <span className="font-medium text-text-main min-w-[30px] text-right">{adj[s.id]}{s.suf}</span>
                      </div>
                      <input type="range" min={s.min} max={s.max} value={adj[s.id]} onChange={e => setAdj(prev => ({ ...prev, [s.id]: Number(e.target.value) }))} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Presets</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'vintage', label: '🎞 Vintage' },
                    { id: 'cine', label: '🎬 Cine' },
                    { id: 'vivid', label: '⚡ Vívido' },
                    { id: 'cool', label: '❄ Frío' },
                    { id: 'warm', label: '🌅 Cálido' },
                    { id: 'dream', label: '✨ Dream' },
                    { id: 'neon', label: '🔆 Neon' },
                    { id: 'fade', label: '🌫 Fade' },
                  ].map(p => (
                    <button key={p.id} className={`px-2 py-1.5 rounded-lg border transition-colors text-[11px] flex items-center gap-1.5 ${activePreset === p.id ? 'border-brand-teal text-brand-teal bg-brand-teal-light' : 'border-border-light bg-bg-element text-text-muted hover:border-brand-teal hover:text-brand-teal hover:bg-brand-teal-light'}`} onClick={() => applyPreset(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bg' && (
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Eliminar fondo</div>
                <div className="flex flex-col gap-2">
                  <button className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-brand-purple-dark border-brand-purple text-white hover:bg-brand-purple justify-center w-full" onClick={removeBg}>✂ Eliminar fondo con IA</button>
                  <div className="text-[11px] text-text-dark leading-[1.5]">Usa Remove.bg API (50 gratis/mes). Si no tienes key, se usa el método canvas integrado.</div>
                  {bgStatus && (
                    <div className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 border ${bgStatus.type === 'success' ? 'bg-brand-teal-light border-brand-teal text-brand-teal' : bgStatus.type === 'error' ? 'bg-brand-red/10 border-brand-red/30 text-brand-red' : 'bg-brand-purple-light border-brand-purple text-brand-purple'}`}>
                      {bgStatus.msg}
                    </div>
                  )}
                  {bgRemoved && (
                    <button className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-transparent border-border-med text-text-muted hover:border-brand-purple hover:text-brand-purple justify-center w-full" onClick={restoreOriginal}>↺ Restaurar original</button>
                  )}
                </div>
              </div>

              <div className="h-[1px] bg-border-light my-0.5"></div>

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Color de fondo</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <div className={`w-7 h-7 rounded-md cursor-pointer border-2 transition-transform shrink-0 bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:10px_10px] ${currentBg === 'transparent' ? 'border-brand-purple scale-110' : 'border-border-med hover:border-brand-purple hover:scale-110'}`} onClick={() => setCurrentBg('transparent')}></div>
                  {['#ffffff', '#000000', '#1a1a2e', '#e8f4f8', '#f5f0e8', '#0d1b2a', '#2d1b69'].map(c => (
                    <div key={c} className={`w-7 h-7 rounded-md cursor-pointer border-2 transition-transform shrink-0 ${currentBg === c ? 'border-brand-purple scale-110' : 'border-transparent hover:border-brand-purple hover:scale-110'}`} style={{ background: c }} onClick={() => setCurrentBg(c)}></div>
                  ))}
                  <input type="color" value="#8b7ff5" title="Color personalizado" onChange={e => setCurrentBg(e.target.value)} />
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Degradados</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    'linear-gradient(135deg,#667eea,#764ba2)',
                    'linear-gradient(135deg,#f093fb,#f5576c)',
                    'linear-gradient(135deg,#4facfe,#00f2fe)',
                    'linear-gradient(135deg,#43e97b,#38f9d7)',
                    'linear-gradient(135deg,#fa709a,#fee140)',
                    'linear-gradient(135deg,#a18cd1,#fbc2eb)',
                    'linear-gradient(135deg,#0f2027,#203a43,#2c5364)',
                    'linear-gradient(135deg,#ffecd2,#fcb69f)'
                  ].map((g, i) => (
                    <div key={i} className={`h-9 rounded-lg cursor-pointer border-2 transition-colors ${currentBg === g ? 'border-brand-purple' : 'border-transparent hover:border-brand-purple'}`} style={{ background: g }} onClick={() => setCurrentBg(g)}></div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Imagen de fondo</div>
                <div className="flex flex-col gap-1.5">
                  <button className="w-full px-3 py-2 rounded-lg border border-dashed border-border-med bg-bg-element text-text-muted text-xs cursor-pointer text-center transition-colors hover:border-brand-purple hover:text-brand-purple" onClick={() => bgImgInputRef.current?.click()}>📸 Subir imagen de fondo</button>
                  <button className="w-full px-3 py-2 rounded-lg border border-dashed border-border-med bg-bg-element text-text-muted text-xs cursor-pointer text-center transition-colors hover:border-brand-purple hover:text-brand-purple" onClick={blurBg}>🌫 Fondo desenfocado (del original)</button>
                  <button className="w-full px-3 py-2 rounded-lg border border-dashed border-border-med bg-bg-element text-text-muted text-xs cursor-pointer text-center transition-colors hover:border-brand-purple hover:text-brand-purple" onClick={() => setCurrentBg('transparent')}>✕ Quitar fondo</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'enhance' && (
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Mejora General</div>
                <div className="flex flex-col gap-2">
                  <button className="px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-brand-purple-dark border-brand-purple text-white hover:bg-brand-purple justify-center w-full" onClick={() => enhanceImage('magic')}>🪄 Mejora Mágica (Color y Nitidez)</button>
                </div>
              </div>

              <div className="h-[1px] bg-border-light my-0.5"></div>

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Mejorar Resolución</div>
                <div className="flex flex-col gap-2">
                  <button className="px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-bg-element border-border-light text-text-main hover:border-brand-purple hover:text-brand-purple justify-center w-full" onClick={() => enhanceImage('upscale2x')}>🔍 Escalar 2x (Suavizado)</button>
                  <button className="px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-bg-element border-border-light text-text-main hover:border-brand-purple hover:text-brand-purple justify-center w-full" onClick={() => enhanceImage('upscale4x')}>🔍 Escalar 4x (Suavizado)</button>
                </div>
              </div>

              <div className="h-[1px] bg-border-light my-0.5"></div>

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Detalle y Ruido</div>
                <div className="flex flex-col gap-2">
                  <button className="px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-bg-element border-border-light text-text-main hover:border-brand-purple hover:text-brand-purple justify-center w-full" onClick={() => enhanceImage('sharpen')}>✨ Aumentar Nitidez</button>
                  <button className="px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-bg-element border-border-light text-text-main hover:border-brand-purple hover:text-brand-purple justify-center w-full" onClick={() => enhanceImage('denoise')}>🌫 Reducir Ruido</button>
                </div>
              </div>
              
              <div className="text-[11px] text-text-dark leading-[1.5] mt-2">
                Estas mejoras se aplican localmente en tu navegador. Pueden tardar unos segundos dependiendo del tamaño de la imagen.
              </div>
            </div>
          )}

          {activeTab === 'hist' && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-dark mb-2.5">Versiones guardadas</div>
              <div className="grid grid-cols-4 gap-1">
                {historyItems.length === 0 ? (
                  <div className="col-span-4 text-[11px] text-text-dark py-2">Sin historial aún</div>
                ) : (
                  historyItems.map((h, i) => (
                    <div key={i} className="aspect-square rounded-[5px] overflow-hidden border border-border-light cursor-pointer transition-colors hover:border-brand-purple" onClick={() => setCurrentSrc(h.src)}>
                      <img src={h.src} className="w-full h-full object-cover" loading="lazy" alt="History" />
                    </div>
                  ))
                )}
              </div>
              <button className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-transparent border-border-med text-text-muted hover:border-brand-purple hover:text-brand-purple justify-center w-full mt-1" onClick={saveToHistory}>💾 Guardar estado actual</button>
            </div>
          )}
          </div>
          
          <div className="p-4 border-t border-border-light bg-bg-panel shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-brand-purple/5 pointer-events-none"></div>
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase mb-3 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-1.5">
                <span className="text-[16px]">✨</span> <span className="bg-gradient-to-r from-brand-purple to-brand-teal bg-clip-text text-transparent">Edición Mágica</span>
              </div>
              <select 
                className="bg-bg-main border border-border-med rounded px-1.5 py-0.5 text-[9px] text-text-dark outline-none cursor-pointer hover:border-brand-purple transition-colors"
                value={imageEditModel}
                onChange={(e) => setImageEditModel(e.target.value as any)}
              >
                <option value="gemini-3.1-flash-image-preview">G 3.1 Flash</option>
                <option value="gemini-2.5-flash-image">G 2.5 Flash</option>
              </select>
            </div>
            <div className="relative z-10">
              <textarea 
                className="w-full bg-bg-main border-2 border-brand-purple/30 rounded-xl p-3 pr-12 text-[13px] leading-relaxed text-text-main placeholder:text-text-muted/70 resize-none focus:outline-none focus:border-brand-purple focus:ring-4 focus:ring-brand-purple/10 transition-all min-h-[110px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]"
                placeholder="Ej: Cambia el fondo a una playa al atardecer, haz que parezca una pintura al óleo..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const val = e.currentTarget.value;
                    if (val.trim()) {
                      editImageWithGemini(val);
                      e.currentTarget.value = '';
                    }
                  }
                }}
              ></textarea>
              <button 
                className="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-brand-purple text-white shadow-lg hover:bg-brand-purple-dark hover:scale-105 active:scale-95 transition-all"
                onClick={(e) => {
                  const ta = e.currentTarget.previousElementSibling as HTMLTextAreaElement;
                  if (ta.value.trim()) {
                    editImageWithGemini(ta.value);
                    ta.value = '';
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* CENTER PANEL */}
        <div className="flex flex-col bg-bg-main">
          <div className="px-4 py-2.5 border-b border-border-light flex items-center gap-2 bg-bg-panel shrink-0 flex-wrap">
            <div className="text-[11px] text-text-dark mr-auto">
              {imgMeta ? <><span className="text-text-muted font-medium">{imgMeta.name}</span> · {imgMeta.size}</> : 'Sin imagen cargada'}
            </div>
            <button className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-transparent border-border-med text-text-muted hover:border-brand-purple hover:text-brand-purple" onClick={() => fileInputRef.current?.click()}>📁 Cargar</button>
            {currentSrc && (
              <>
                <button className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-brand-teal-light border-brand-teal text-brand-teal hover:bg-[rgba(61,216,163,0.22)]" onClick={downloadResult}>💾 Descargar</button>
                <button className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-brand-red/10 border-brand-red/30 text-brand-red hover:bg-brand-red/20" onClick={clearAll}>✕</button>
              </>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden"
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files[0];
              if (f && f.type.startsWith('image/')) loadImg({ target: { files: [f] } } as any);
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(var(--color-border-light)_1px,transparent_1px),linear-gradient(90deg,var(--color-border-light)_1px,transparent_1px)] bg-[size:28px_28px] opacity-30 pointer-events-none"></div>

            {!currentSrc ? (
              <div className={`flex flex-col items-center justify-center gap-3.5 cursor-pointer border-2 border-dashed rounded-xl p-[50px_32px] bg-bg-panel relative z-10 transition-colors max-w-[480px] w-full ${isDragging ? 'border-brand-purple bg-brand-purple-light' : 'border-border-med hover:border-brand-purple hover:bg-brand-purple-light'}`} onClick={() => fileInputRef.current?.click()}>
                <div className={`w-[60px] h-[60px] rounded-full border-2 border-dashed flex items-center justify-center text-[26px] bg-bg-element transition-colors ${isDragging ? 'border-brand-purple bg-brand-purple-light' : 'border-border-med'}`}>🖼</div>
                <h2 className="font-syne text-[17px] font-semibold">Arrastra o sube tu imagen</h2>
                <p className="text-xs text-text-dark">PNG · JPG · WEBP · GIF · hasta 15MB</p>
                <button className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border bg-brand-purple-dark border-brand-purple text-white hover:bg-brand-purple mt-2" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>Elegir archivo</button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 relative z-10 w-full h-full overflow-hidden">
                <div 
                  className="relative flex items-center justify-center flex-1 w-full min-h-0 overflow-hidden cursor-grab active:cursor-grabbing"
                  onWheel={(e) => {
                    e.preventDefault();
                    const zoomFactor = 0.1;
                    setZoom(prev => Math.max(0.1, Math.min(prev + (e.deltaY < 0 ? zoomFactor : -zoomFactor), 10)));
                  }}
                  onMouseDown={(e) => {
                    setIsPanning(true);
                    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
                  }}
                  onMouseMove={(e) => {
                    if (isPanning) {
                      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
                    }
                  }}
                  onMouseUp={() => setIsPanning(false)}
                  onMouseLeave={() => setIsPanning(false)}
                >
                  <div 
                    className="relative inline-block transition-transform duration-75"
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                  >
                    <canvas ref={bgCanvasRef} className="absolute top-0 left-0 w-full h-full rounded-xl z-0 pointer-events-none" />
                    <img
                      ref={imgRef}
                      src={currentSrc}
                      alt="Imagen editada"
                      className="relative z-10 rounded-xl border border-border-med block shadow-[0_16px_48px_rgba(0,0,0,0.7)] max-h-[60vh] max-w-[60vw] object-contain transition-transform duration-300 pointer-events-none"
                      style={{ filter: filterStyle, transform: transformStyle }}
                      onLoad={syncBgCanvas}
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-[11px] text-text-dark shrink-0">← Controles a la izquierda · Pide cambios a la IA →</div>
                  {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
                    <button 
                      className="px-3 py-1 rounded-full text-[10px] font-medium border border-border-med bg-bg-element text-text-muted hover:text-brand-purple hover:border-brand-purple transition-colors"
                      onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                    >
                      Restablecer vista ({Math.round(zoom * 100)}%)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="hidden lg:flex bg-bg-panel border-l border-border-light flex-col min-h-0">
          <div className="p-[14px_18px] border-b border-border-light flex items-center gap-2 shrink-0">
            <div className="w-[7px] h-[7px] rounded-full bg-brand-teal shadow-[0_0_7px_var(--color-brand-teal)] animate-[pulse_2.5s_ease-in-out_infinite]"></div>
            <span className="font-syne text-[14px] font-bold">Asistente IA</span>
            <select className="ml-auto bg-bg-element border border-border-med rounded-lg px-2 py-1 text-text-muted text-[11px] cursor-pointer font-dm-sans outline-none" value={aiModel} onChange={e => setAiModel(e.target.value)}>
              <option value="gemini" className="bg-bg-element">✦ Gemini Flash (gratis)</option>
              <option value="gemini-pro" className="bg-bg-element">✦ Gemini Pro</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-[12px_14px] border-b border-border-light shrink-0">
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('describe')}><span className="text-[13px]">👁</span>Describir</button>
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('enhance')}><span className="text-[13px]">✨</span>Auto-mejorar</button>
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('colors')}><span className="text-[13px]">🎨</span>Análisis color</button>
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('suggest')}><span className="text-[13px]">💡</span>Sugerencias</button>
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('caption')}><span className="text-[13px]">📝</span>Caption RRSS</button>
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('alt')}><span className="text-[13px]">♿</span>Texto alt</button>
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('bg')}><span className="text-[13px]">🖼</span>Sugerir fondo</button>
            <button className="px-[7px] py-[8px] rounded-lg border border-border-light bg-bg-element text-text-muted text-[11px] cursor-pointer transition-colors flex items-center gap-1.5 font-medium hover:border-brand-purple hover:text-[#c0baff] hover:bg-brand-purple-light" onClick={() => aiDo('style')}><span className="text-[13px]">🎭</span>Estilo artístico</button>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5 scroll-smooth" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-[3px] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="text-[10px] text-text-dark font-medium px-[3px]">
                  {m.role === 'ai' ? 'Pixelate PRO' : 'Tú'}
                </div>
                <div className={`max-w-[93%] px-[13px] py-[9px] text-[12.5px] leading-[1.6] ${m.role === 'ai' ? 'bg-bg-element border border-border-light text-text-muted rounded-[4px_12px_12px_12px]' : 'bg-gradient-to-br from-brand-purple-dark to-[#7c50e0] text-white rounded-[12px_4px_12px_12px]'}`}>
                  {m.isThinking ? (
                    <div className="flex items-center gap-1 h-5">
                      <span className="w-[5px] h-[5px] bg-text-dark rounded-full animate-[db_1.2s_infinite]"></span>
                      <span className="w-[5px] h-[5px] bg-text-dark rounded-full animate-[db_1.2s_infinite_0.2s]"></span>
                      <span className="w-[5px] h-[5px] bg-text-dark rounded-full animate-[db_1.2s_infinite_0.4s]"></span>
                    </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\n/g, '<br>') }} />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-[9px_14px] border-t border-border-light shrink-0">
            <div className="text-[9px] text-text-dark font-semibold tracking-[0.1em] uppercase mb-[7px]">Acciones rápidas</div>
            <div className="flex flex-wrap gap-1">
              {['¿Qué ves?', 'Mejorar foto', 'Fondo ideal', 'Más dramático', 'Para LinkedIn', 'Estilo producto'].map(chip => (
                <span key={chip} className="px-[9px] py-1 rounded-full text-[11px] border border-border-light bg-bg-element text-text-muted cursor-pointer transition-colors hover:border-brand-purple hover:text-brand-purple hover:bg-brand-purple-light" onClick={() => { setUserInput(chip); sendMsg(chip); }}>{chip}</span>
              ))}
            </div>
          </div>

          <div className="p-[10px_14px] border-t border-border-light flex gap-[7px] items-end shrink-0">
            <textarea
              className="flex-1 bg-bg-element border border-border-light rounded-lg px-3 py-2 text-[12.5px] text-text-main outline-none resize-none max-h-[80px] leading-[1.5] transition-colors focus:border-brand-purple placeholder:text-text-dark"
              rows={1}
              placeholder="Describe qué quieres hacer..."
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMsg();
                }
              }}
            ></textarea>
            <button className="w-9 h-9 rounded-lg bg-brand-purple-dark border border-brand-purple cursor-pointer flex items-center justify-center text-white text-[14px] shrink-0 transition-colors hover:bg-brand-purple" onClick={() => sendMsg()}>➤</button>
          </div>
        </div>

      </div>

      {showHelp && (
        <div className="fixed inset-0 bg-black/75 z-[500] flex items-center justify-center">
          <div className="bg-bg-panel border border-border-med rounded-xl p-7 max-w-[440px] w-[90%] flex flex-col gap-4">
            <h3 className="font-syne text-[17px] font-bold">🔑 Cómo obtener las API Keys</h3>
            <p className="text-[13px] text-text-muted leading-[1.6]">
              <strong>Gemini Flash (GRATIS):</strong><br />
              1. Ve a <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-brand-purple hover:underline">aistudio.google.com/app/apikey</a><br />
              2. Haz clic en &quot;Create API key&quot;<br />
              3. Copia y pega la key aquí<br />
              ✅ <strong>Completamente gratis</strong>: 15 requests/min, 1M tokens/día, soporte de imágenes
            </p>
            <div className="h-[1px] bg-border-light my-0.5"></div>
            <p className="text-[13px] text-text-muted leading-[1.6]">
              <strong>Remove.bg (Opcional, 50 gratis/mes):</strong><br />
              1. Ve a <a href="https://www.remove.bg/api" target="_blank" className="text-brand-purple hover:underline">remove.bg/api</a><br />
              2. Crea cuenta gratuita<br />
              3. Copia tu API key<br />
              ✅ Si no la tienes, el editor usa un método alternativo integrado.
            </p>
            <div className="flex gap-2 justify-end mt-2">
              <button className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-brand-purple-dark border border-brand-purple text-white hover:bg-brand-purple transition-colors" onClick={() => setShowHelp(false)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`fixed bottom-[22px] right-[22px] px-[18px] py-[11px] bg-bg-element border rounded-xl text-[12.5px] z-[999] transition-all duration-300 flex items-center gap-[7px] shadow-[0_8px_28px_rgba(0,0,0,0.6)] ${toast ? 'translate-y-0 opacity-100' : 'translate-y-[70px] opacity-0'} ${toast?.type === 'ok' ? 'border-[rgba(61,216,163,0.4)] text-brand-teal' : toast?.type === 'err' ? 'border-[rgba(248,113,113,0.4)] text-brand-red' : 'border-border-med text-text-muted'}`}>
        {toast?.msg}
      </div>

      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={loadImg} />
      <input type="file" ref={bgImgInputRef} accept="image/*" className="hidden" onChange={loadBgImg} />
    </>
  );
}

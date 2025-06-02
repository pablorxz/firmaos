import { useState, useRef, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import './index.css'
import { pdfjs } from 'react-pdf'
import { DndContext, useDraggable } from '@dnd-kit/core';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export default function App() {
  const [step, setStep] = useState(1); // 1: Bienvenida, 2: Editar, 3: Completado
  const [pdfFile, setPdfFile] = useState(null)
  const [firmante, setFirmante] = useState('')
  const [qrData, setQrData] = useState('')
  const [pdfUrl, setPdfUrl] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const qrRef = useRef()
  const [signatures, setSignatures] = useState([])
  const [renderedPages, setRenderedPages] = useState([])
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [signatureSize, setSignatureSize] = useState({ width: 160, height: 40 });

  // Efecto para escuchar cambios de tamaño de ventana
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

// Efecto para calcular tamaño real de la firma
useEffect(() => {
  if (qrData && firmante && pdfFile) {
    calculateRealSignatureSize().then(size => {
      setSignatureSize(size);
    });
  }
}, [qrData, firmante, pdfFile]);

  // Hook para manejar el arrastre de elementos
  const DraggableSignature = ({ id, x, y, onRemove, scale, signatureSize }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: id.toString(),
    });
  
    const previewWidth = signatureSize.width * scale;
    const previewHeight = signatureSize.height * scale;
  
    const style = {
      position: 'absolute',
      left: isDragging && transform ? x + transform.x : x,
      top: isDragging && transform ? y + transform.y : y,
      width: `${previewWidth}px`,
      height: `${previewHeight}px`,
      backgroundColor: isDragging ? 'rgba(0, 255, 0, 0.7)' : 'rgba(0, 0, 255, 0.5)',
      boxShadow: '0 0 0 2px blue', // Borde por fuera en lugar de border
      borderRadius: '4px',
      cursor: 'move',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${Math.max(8, 10 * scale)}px`,
      fontWeight: 'bold',
      color: 'white',
      textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
      touchAction: 'none',
      zIndex: 10,
    };

    const handleRemoveClick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('Eliminando firma con ID:', id); // Para debug
      onRemove(id);
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
      >
        📝 Firma
        <button
          onClick={handleRemoveClick}
          onPointerDown={(e) => e.stopPropagation()} // Evita que inicie el drag
          onTouchStart={(e) => e.stopPropagation()} // Para móvil
          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
          style={{ 
            fontSize: '10px',
            zIndex: 20,
            pointerEvents: 'auto'
          }}
        >
          ×
        </button>
      </div>
    );
  };

  // Maneja la carga del PDF
  const handlePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      setPdfFile(file);
      await renderPDF(file);
    } catch (error) {
      setMensaje('Error al cargar el PDF');
    } finally {
      setIsLoading(false);
    }
  };

  // Función para continuar al paso 2
  const handleContinue = () => {
    if (!pdfFile || !firmante.trim()) return;
    generarQR();
    setStep(2);
  };

  // Función para agregar una firma
  const addSignature = () => {
    // Obtener el scale actual para calcular posición inicial correcta
    const currentPageData = renderedPages[currentPage];
    let scale = 1;
    if (currentPageData) {
      const viewportHeight = window.innerHeight;
      const headerHeight = 64;
      const footerHeight = 64;
      const availableHeight = viewportHeight - headerHeight - footerHeight - 20;
      const availableWidth = window.innerWidth - 20;
      
      const scaleWidth = availableWidth / currentPageData.width;
      const scaleHeight = availableHeight / currentPageData.height;
      scale = Math.min(scaleWidth, scaleHeight, 1);
    }

    setSignatures((prev) => [
      ...prev,
      { 
        id: Date.now(), 
        x: 50 / scale, // Coordenadas reales del PDF 
        y: 50 / scale, // Coordenadas reales del PDF
        pageIndex: currentPage 
      },
    ]);
  };

  // Función para eliminar firma
  const removeSignature = (id) => {
    setSignatures((prev) => prev.filter(sig => sig.id !== id));
  };

  // Renderiza las firmas en la página actual
  const renderSignatures = () => {
    // Obtener el scale actual
    const currentPageData = renderedPages[currentPage];
    let scale = 1;
    if (currentPageData) {
      const viewportHeight = window.innerHeight;
      const headerHeight = 64;
      const footerHeight = 64;
      const availableHeight = viewportHeight - headerHeight - footerHeight - 20;
      const availableWidth = window.innerWidth - 20;
      
      const scaleWidth = availableWidth / currentPageData.width;
      const scaleHeight = availableHeight / currentPageData.height;
      scale = Math.min(scaleWidth, scaleHeight, 1);
    }

    return signatures
      .filter((sig) => sig.pageIndex === currentPage)
      .map((sig) => (
        <DraggableSignature
          key={sig.id}
          id={sig.id}
          x={sig.x * scale}
          y={sig.y * scale}
          scale={scale}
          signatureSize={signatureSize}
          onRemove={removeSignature}
        />
      ));
  };

  // Navegación de páginas
  const goToPreviousPage = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(renderedPages.length - 1, prev + 1));
  };

  const goToPage = (pageNum) => {
    const page = parseInt(pageNum) - 1;
    if (page >= 0 && page < renderedPages.length) {
      setCurrentPage(page);
    }
  };

  // Función para calcular el tamaño real usando insertarSello
  const calculateRealSignatureSize = async () => {
    if (!qrData || !firmante || !pdfFile) return { width: 160, height: 40 };

    try {
      // Generar QR temporal para obtener el qrDataURL
      const svg = qrRef.current?.querySelector('svg');
      if (!svg) return { width: 160, height: 40 };

      const svgString = new XMLSerializer().serializeToString(svg);
      const svgBase64 = btoa(svgString);
      const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

      const img = new Image();
      img.src = svgDataUrl;
      await new Promise((r) => (img.onload = r));
      const cvs = document.createElement('canvas');
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pngDataUrl = cvs.toDataURL('image/png');

      // Usar insertarSello solo para calcular dimensiones
      return await insertarSello(pdfFile, pngDataUrl, firmante, true);
    } catch (error) {
      return { width: 160, height: 40 }; // Fallback
    }
  };

  // Genera el contenido del QR
  const generarQR = () => {
    const fecha = new Date().toISOString()
    setQrData(
      `FIRMADO POR: ${firmante}
RAZON:
LOCALIZACION:
FECHA: ${fecha}
Firmado digitalmente con FirmaOS`
    )
  }

  // Divide el texto en líneas según las reglas especificadas
  const dividirTexto = (texto, maxPalabrasPorLinea = 2, minCaracteresPorLinea = 10, maxCaracteresPorLinea = 20) => {
    const palabras = texto.split(" ");
    const lineas = [];
    let lineaActual = "";

    palabras.forEach((palabra) => {
      if (
        lineaActual.split(" ").length < maxPalabrasPorLinea &&
        (lineaActual.length + palabra.length + 1 <= maxCaracteresPorLinea || lineaActual.length < minCaracteresPorLinea)
      ) {
        lineaActual += (lineaActual ? " " : "") + palabra;
      } else {
        lineas.push(lineaActual);
        lineaActual = palabra;
      }
    });

    if (lineaActual) {
      lineas.push(lineaActual);
    }

    return lineas;
  };

  // Inserta el sello en el PDF
  const insertarSello = async (pdfFile, qrDataURL, firmante, onlyCalculateSize = false) => {
    const existingPdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const pngImage = await pdfDoc.embedPng(qrDataURL);
    const { width, height } = pngImage.scale(0.16);

    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
    const courierNormal = await pdfDoc.embedFont(StandardFonts.Courier);

    const lineasFirmante = dividirTexto(firmante);
    const numLineas = lineasFirmante.length;
    
    const fontSize = 9;
    const fontSizeHeader = 5;
    const lineHeight = 9;
    const headerText = "Firmado electrónicamente por:";
    
    // Calcular la posición del texto
    const totalTextHeight = fontSize + (numLineas * lineHeight);
    const adjusteX = 5;
    
    // Calcular ancho del texto considerando header y nombre
    const maxLineLength = Math.max(...lineasFirmante.map(linea => linea.length));

    // Calcular anchos (Courier: ~60% del font size por carácter)
    const headerWidth = headerText.length * (fontSizeHeader * 0.6); // Header font size 5
    const nameWidth = maxLineLength * (fontSize * 0.6); // Nombre font size 9
    const estimatedTextWidth = Math.max(80, Math.max(headerWidth, nameWidth) + 10);     // Usar el mayor ancho + padding
    
    // Tamaño total de la firma
    const totalWidth = width + adjusteX + estimatedTextWidth;
    const totalHeight = Math.max(height, totalTextHeight + fontSizeHeader + 5);
    
    // Si solo queremos calcular el tamaño, retornar dimensiones
    if (onlyCalculateSize) {
      return { width: totalWidth, height: totalHeight };
    }

    // Continuar con la inserción normal
    signatures.forEach((sig) => {
      const page = pdfDoc.getPages()[sig.pageIndex];
      
      const realX = sig.x + 1;
      const realY = sig.y - 0;
      
      const adjusteY = -5;
      const qrCenterY = page.getHeight() - realY - (height / 2);
      const textStartY = qrCenterY + (totalTextHeight / 2) + adjusteY;
      const textX = realX + width + adjusteX; 
      
      page.drawImage(pngImage, {
        x: realX,
        y: page.getHeight() - realY - height,
        width,
        height,
      });
      
      page.drawText(headerText, {
        x: textX,
        y: textStartY,
        size: fontSizeHeader,
        font: courierNormal,
        color: rgb(0, 0, 0),
      });
      
      lineasFirmante.forEach((linea, index) => {
        page.drawText(linea, {
          x: textX,
          y: textStartY - fontSize - (index * lineHeight) - 2,
          size: fontSize,
          font: courierBold,
          color: rgb(0, 0, 0),
        });
      });
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
  };

  // Función para firmar el PDF
  const firmarPDF = async () => {
    if (!qrData || !pdfFile) return;

    setIsLoading(true);
    try {
      const svg = qrRef.current.querySelector('svg');
      if (!svg) throw new Error('SVG QR not found');

      const svgString = new XMLSerializer().serializeToString(svg);
      const svgBase64 = btoa(svgString);
      const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

      const img = new Image();
      img.src = svgDataUrl;
      await new Promise((r) => (img.onload = r));
      const cvs = document.createElement('canvas');
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const pngDataUrl = cvs.toDataURL('image/png');
      await insertarSello(pdfFile, pngDataUrl, firmante);
      setStep(3);
    } catch (error) {
      setMensaje('Error al firmar el documento');
    } finally {
      setIsLoading(false);
    }
  };

  // Renderiza el PDF en el contenedor
  const renderPDF = async (file) => {
    try {
      const fileReader = new FileReader();

      fileReader.onload = async (e) => {
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await pdfjs.getDocument(typedArray).promise;

        const pages = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);

          const viewport = page.getViewport({ scale: 1 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          await page.render(renderContext).promise;

          pages.push({
            pageIndex: pageNum - 1,
            canvas,
            width: viewport.width,
            height: viewport.height,
          });
        }

        setRenderedPages(pages);
        setCurrentPage(0);
      };

      fileReader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error rendering PDF:', error);
      alert('Failed to render PDF. Please check the file and try again.');
    }
  };

  // Función para reiniciar
  const handleRestart = () => {
    setStep(1);
    setPdfFile(null);
    setFirmante('');
    setQrData('');
    setPdfUrl(null);
    setMensaje('');
    setSignatures([]);
    setRenderedPages([]);
    setCurrentPage(0);
  };

  // PASO 1: BIENVENIDA
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">FirmaOS</h1>
            <p className="text-gray-400 text-sm">Generador de Sello Digital</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block font-medium mb-2 text-sm">Nombre del firmante:</label>
              <input
                type="text"
                value={firmante}
                onChange={(e) => setFirmante(e.target.value)}
                className="w-full border border-gray-600 bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div>
              <label className="block font-medium mb-2 text-sm">Cargar PDF:</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePDFUpload}
                className="w-full bg-gray-700 p-3 text-white rounded border border-gray-600 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
              />
            </div>

            {isLoading && (
              <div className="text-center py-4">
                <div className="inline-flex items-center px-4 py-2 bg-blue-600 rounded-full">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  <span className="text-sm">Cargando PDF...</span>
                </div>
              </div>
            )}

            <button
              onClick={handleContinue}
              disabled={!pdfFile || !firmante.trim() || isLoading}
              className="w-full bg-blue-600 text-white font-semibold px-4 py-3 rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Continuar
            </button>

            {mensaje && (
              <div className="text-center text-red-400 text-sm">{mensaje}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PASO 2: EDITAR PDF
  if (step === 2) {
    const currentPageData = renderedPages[currentPage];
    
    // Calcular dimensiones del viewport disponible
    const viewportHeight = window.innerHeight;
    const headerHeight = 64;
    const footerHeight = 64;
    const availableHeight = viewportHeight - headerHeight - footerHeight - 20;
    const availableWidth = window.innerWidth - 20;
    
    // Calcular el scale basado en ambas dimensiones
    let scale = 1;
    if (currentPageData) {
      const scaleWidth = availableWidth / currentPageData.width;
      const scaleHeight = availableHeight / currentPageData.height;
      scale = Math.min(scaleWidth, scaleHeight, 1);
    }

    return (
      <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
        {/* Barra superior - altura fija */}
        <div className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700 flex-shrink-0">
          <button
            onClick={() => setStep(1)}
            className="flex items-center text-gray-300 hover:text-white text-sm"
          >
            ← Volver
          </button>
          <h2 className="font-semibold text-sm">Editar Documento</h2>
          <button
            onClick={firmarPDF}
            disabled={signatures.length === 0 || isLoading}
            className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 disabled:opacity-40 text-sm"
          >
            {isLoading ? 'Firmando...' : 'Firmar PDF'}
          </button>
        </div>

        {/* Contenedor del PDF - toma el espacio restante */}
        <div className="flex-1 bg-gray-700 flex items-center justify-center p-2 overflow-hidden">
          <DndContext
            onDragEnd={({ active, delta }) => {
              const id = parseInt(active.id);
              setSignatures((prev) =>
                prev.map((sig) =>
                  sig.id === id
                    ? { 
                        ...sig, 
                        // Convertir las coordenadas del preview escalado a coordenadas reales del PDF
                        x: Math.max(0, sig.x + (delta.x / scale)),
                        y: Math.max(0, sig.y + (delta.y / scale))
                      }
                    : sig
                )
              );
            }}
          >
            {currentPageData && (
              <div
                className="relative bg-white shadow-lg"
                style={{
                  width: currentPageData.width * scale,
                  height: currentPageData.height * scale,
                  maxWidth: '100%',
                  maxHeight: '100%',
                }}
              >
                {/* Canvas del PDF */}
                <canvas
                  ref={(canvas) => {
                    if (canvas && currentPageData.canvas) {
                      const ctx = canvas.getContext('2d');
                      canvas.width = currentPageData.width * scale;
                      canvas.height = currentPageData.height * scale;
                      
                      // Limpiar y escalar el contexto
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                      ctx.scale(scale, scale);
                      ctx.drawImage(currentPageData.canvas, 0, 0);
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                  }}
                />

                {/* Overlay para las firmas - SIN transform scale */}
                <div className="absolute inset-0">
                  {renderSignatures()}
                </div>
              </div>
            )}
          </DndContext>
        </div>

        {/* Resto del código igual... */}
        <div className="bg-gray-800 p-3 flex justify-between items-center border-t border-gray-700 flex-shrink-0">
          <button
            onClick={addSignature}
            className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 text-sm"
          >
            + Firma
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 0}
              className="p-2 text-gray-300 hover:text-white disabled:opacity-40 text-lg"
            >
              ←
            </button>
            
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={currentPage + 1}
                onChange={(e) => goToPage(e.target.value)}
                className="w-12 bg-gray-700 text-white text-center rounded border border-gray-600 text-sm"
                min="1"
                max={renderedPages.length}
              />
              <span className="text-gray-400 text-sm">/ {renderedPages.length}</span>
            </div>

            <button
              onClick={goToNextPage}
              disabled={currentPage === renderedPages.length - 1}
              className="p-2 text-gray-300 hover:text-white disabled:opacity-40 text-lg"
            >
              →
            </button>
          </div>
        </div>

        {/* QR oculto */}
        {qrData && (
          <div ref={qrRef} style={{ display: "none" }}>
            <QRCodeSVG value={qrData} size={220} />
          </div>
        )}
      </div>
    );
  }

  // PASO 3: COMPLETADO
  if (step === 3) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-lg p-6 text-center">
          <div className="mb-6">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2">¡Documento Firmado!</h1>
            <p className="text-gray-400">Tu PDF ha sido firmado exitosamente</p>
          </div>

          <div className="space-y-4">
            {pdfUrl && (
              <a
                href={pdfUrl}
                download={`firmado_${pdfFile.name}`}
                className="block w-full bg-green-600 text-white font-semibold px-4 py-3 rounded hover:bg-green-700 transition-colors"
              >
                📥 Descargar PDF Firmado
              </a>
            )}

            <button
              onClick={handleRestart}
              className="w-full bg-gray-600 text-white font-semibold px-4 py-3 rounded hover:bg-gray-700 transition-colors"
            >
              Firmar Otro Documento
            </button>
          </div>
        </div>
      </div>
    );
  }
}
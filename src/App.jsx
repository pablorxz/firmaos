import { useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'      // ← SVG version
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import './index.css'
import { pdfjs } from 'react-pdf'
import { DndContext, useDraggable } from '@dnd-kit/core';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export default function App() {
  const [pdfFile, setPdfFile] = useState(null) // Archivo PDF cargado
  const [firmante, setFirmante] = useState('') // Nombre del firmante
  const [qrData, setQrData] = useState('') // Datos del QR
  const [pdfUrl, setPdfUrl] = useState(null) // URL del PDF firmado
  const [mensaje, setMensaje] = useState('') // Mensaje de estado
  const qrRef = useRef() // Referencia al contenedor del QR
  const [signatures, setSignatures] = useState([]); // [{ x, y, pageIndex }]
  const [renderedPages, setRenderedPages] = useState([]); // Páginas renderizadas del PDF

  // Hook para manejar el arrastre de elementos
const DraggableSignature = ({ id, x, y }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id.toString(),
  });

  const style = {
    position: 'absolute',
    left: isDragging && transform ? x + transform.x : x, // Usa transform solo mientras se arrastra
    top: isDragging && transform ? y + transform.y : y,
    width: '130px',
    height: '37px',
    backgroundSize: 'cover',
    backgroundColor: 'rgba(0, 0, 255, 0.5)', // Color de fondo visible como respaldo
    border: '1px solid white', // Borde para identificar el área
    cursor: 'move',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    />
  );
};

  // Maneja la carga del PDF
  const handlePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    setPdfFile(file);
    await renderPDF(file); // Renderiza el PDF
  };

  // Función para agregar una firma
  const addSignature = (pageIndex) => {
    setSignatures((prev) => [
      ...prev,
      { id: Date.now(), x: 50, y: 50, pageIndex }, // Genera un id único con Date.now()
    ]);
  };
  
  // Renderiza las firmas en cada página
  const renderSignatures = (pageIndex) => {
    return signatures
      .filter((sig) => sig.pageIndex === pageIndex)
      .map((sig) => (
        <DraggableSignature
          key={sig.id}
          id={sig.id}
          x={sig.x}
          y={sig.y}
        />
      ));
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
  const insertarSello = async (pdfFile, qrDataURL, firmante) => {
    const existingPdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const pngImage = await pdfDoc.embedPng(qrDataURL);
    const { width, height } = pngImage.scale(0.16); // Reduce el tamaño del QR

    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
    const courierNormal = await pdfDoc.embedFont(StandardFonts.Courier);

    // Recorre las firmas y dibújalas en las páginas correspondientes
    signatures.forEach((sig) => {
      const page = pdfDoc.getPages()[sig.pageIndex];
      
      // Divide el texto del firmante en líneas
      const lineasFirmante = dividirTexto(firmante);
      const numLineas = lineasFirmante.length;
      
      // Configuración de texto
      const fontSize = 9;
      const fontSizeHeader = 5;
      const lineHeight = 9;
      const headerText = "Firmado electrónicamente por:";
      
      // Calcula el alto total del texto (header + líneas del firmante)
      const totalTextHeight = fontSize + (numLineas * lineHeight);
      
      // Calcula posición Y para centrar texto verticalmente con respecto al QR
      const adjusteY = -5; // Ajuste manual de la posición Y
      const qrCenterY = page.getHeight() - sig.y - (height / 2);
      const textStartY = qrCenterY + (totalTextHeight / 2) + adjusteY;
      
      // Posición X del texto (a la derecha del QR con un margen)
      const adjusteX = 5; // Ajuste manual de la posición X
      const textX = sig.x + width + adjusteX; 
      
      // Dibuja el QR
      page.drawImage(pngImage, {
        x: sig.x,
        y: page.getHeight() - sig.y - height,
        width,
        height,
      });
      
      // Dibuja "Firmado electrónicamente por:"
      page.drawText(headerText, {
        x: textX,
        y: textStartY,
        size: fontSizeHeader,
        font: courierNormal,
        color: rgb(0, 0, 0),
      });
      
      // Dibuja cada línea del nombre del firmante
      lineasFirmante.forEach((linea, index) => {
        page.drawText(linea, {
          x: textX,
          y: textStartY - fontSize - (index * lineHeight) - 2, // -2 para separación extra entre header y nombre
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
    setMensaje('El documento ha sido firmado exitosamente.');
  };

  // Función para firmar el PDF
  const firmarPDF = async () => {
    if (!qrData || !pdfFile) return

    // 1) grab the SVG element
    const svg = qrRef.current.querySelector('svg')
    if (!svg) throw new Error('SVG QR not found')

    // 2) serialize to string
    const svgString = new XMLSerializer().serializeToString(svg)

    // 3) build a Data-URI
    const svgBase64 = btoa(svgString)
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`

    // 4) rasterize into an in-memory canvas
    const img = new Image()
    img.src = svgDataUrl
    await new Promise((r) => (img.onload = r))
    const cvs = document.createElement('canvas')
    cvs.width = img.width
    cvs.height = img.height
    const ctx = cvs.getContext('2d')
    ctx.drawImage(img, 0, 0)

    // 5) now embed that PNG into your PDF
    const pngDataUrl = cvs.toDataURL('image/png')
    setMensaje('Generando PDF firmado…')
    await insertarSello(pdfFile, pngDataUrl, firmante)
    setMensaje('El documento ha sido firmado exitosamente.')
  }

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

        // Renderiza la página en un canvas
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

        // Almacena la información de la página
        pages.push({
          pageIndex: pageNum - 1,
          canvas,
          width: viewport.width,
          height: viewport.height,
        });
      }

      setRenderedPages(pages); // Actualiza el estado con las páginas renderizadas
    };

    fileReader.readAsArrayBuffer(file);
  } catch (error) {
    console.error('Error rendering PDF:', error);
    alert('Failed to render PDF. Please check the file and try again.');
  }
};

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-gray-800 rounded-xl shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-8 text-center">FirmaOS – Generador de Sello</h1>
  
        <div className="mb-6">
          <label className="block font-medium mb-2">Nombre del firmante:</label>
          <input
            type="text"
            value={firmante}
            onChange={(e) => setFirmante(e.target.value)}
            className="w-full border border-gray-600 bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Ej: Juan Pérez"
          />
        </div>
  
        <div className="mb-6">
          <label className="block font-medium mb-2">Sube un archivo PDF:</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handlePDFUpload}
            className="w-full bg-gray-700 p-2 text-white rounded border border-gray-600"
          />
        </div>
  
        <DndContext
          onDragEnd={({ active, delta }) => {
            console.log('Drag End:', { id: active.id, delta });

            const id = parseInt(active.id); // Convierte a número para comparación correcta

            setSignatures((prev) => {
              const updatedSignatures = prev.map((sig) =>
                sig.id === id
                  ? { ...sig, x: sig.x + delta.x, y: sig.y + delta.y }
                  : sig
              );
              console.log('Updated Signatures:', updatedSignatures);
              return updatedSignatures;
            });
          }}
        >
          <div id="pdf-container" className="mb-6 bg-gray-700 p-4 rounded overflow-auto max-h-96">
            {renderedPages.map(({ pageIndex, canvas, width, height }) => (
              <div
                key={pageIndex}
                className="pdf-page-wrapper"
                style={{ position: 'relative', width, height }}
              >
                {/* Renderiza el canvas manualmente */}
                <div ref={(el) => el && el.appendChild(canvas)} />

                {/* Renderiza las firmas */}
                <div
                  className="interactive-layer"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {renderSignatures(pageIndex)}
                </div>
              </div>
            ))}
          </div>
        </DndContext>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            className="w-full bg-blue-600 text-white font-semibold px-4 py-3 rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
            onClick={generarQR}
            disabled={!pdfFile || !firmante.trim()}
          >
            Generar QR de Firma
          </button>
          <button
            onClick={() => addSignature(0)} // Agrega firma en la página 1 (índice 0)
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Agregar Firma
          </button>
        </div>
  
        {mensaje && (
          <div className="mt-4 text-green-400 font-medium text-center">{mensaje}</div>
        )}

        {qrData && (
          // hidden SVG container
          <div ref={qrRef} style={{ display: "none" }}>
            <QRCodeSVG value={qrData} size={220} />
          </div>
        )}

        {pdfUrl ? (
          <div className="mt-4 text-center">
            <a
              href={pdfUrl}
              download={`firmado_${pdfFile.name}`}
              className="inline-block bg-green-600 text-white font-semibold px-4 py-2 rounded hover:bg-green-700 transition-colors"
            >
              Descargar PDF Firmado
            </a>
          </div>
        ) : (
          !pdfUrl && qrData && (
            <button
              className="w-full bg-green-600 text-white font-semibold px-4 py-3 rounded hover:bg-green-700 transition-colors"
              onClick={firmarPDF}
              disabled={!qrData || !pdfFile}
            >
              Generar PDF Firmado
            </button>
          )
        )}
  
        {qrData && (
          <div className="mt-10 text-center">
            <pre className="mt-4 text-sm bg-gray-700 text-green-300 p-4 rounded text-left whitespace-pre-wrap">
              {qrData}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

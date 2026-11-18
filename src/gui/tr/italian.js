var TR = {
  // background
  backgroundTitle: 'Sfondo',
  backgroundReset: 'Resetta',
  backgroundImport: 'Importa (jpg, png...)',
  backgroundFill: 'Riempi',

  // camera
  cameraTitle: 'Camera',
  cameraReset: 'Vista',
  cameraCenter: 'Resetta (bar)',
  cameraFront: 'Fronte (F)',
  cameraLeft: 'Sinistra (L)',
  cameraTop: 'Sopra (T)',
  cameraMode: 'Modalitá',
  cameraOrbit: 'Orbita (Ruota intorno)',
  cameraSpherical: 'Sferica (Trackball)',
  cameraPlane: 'Planare (Trackball)',
  cameraProjection: 'Proiezione',
  cameraPerspective: 'Prospettiva',
  cameraOrthographic: 'Ortografica',
  cameraFov: 'Fov',
  cameraPivot: 'Seleziona pivot',

  // file
  fileTitle: 'Files (importa/esporta)',
  fileImportTitle: 'Importa',
  fileAdd: 'Aggiungi (obj, sgl, ply, stl, glb, vrm)',
  fileAutoMatrix: 'Scala e centra',
  fileVertexSRGB: 'sRGB vertex color',
  fileExportSceneTitle: 'Esporta Scena',
  fileExportAll: 'Exporta tutto',
  fileExportGLB: "Salva .glb/.vrm (modello originale aggiornato)",
  fileExportGLBNone: "Apri prima un file .glb o .vrm: questo comando ci riporta dentro la scultura.",
  fileExportGLBNothing: "Non è stato possibile riportare nulla nel file originale:",
  fileExportGLBDone: "Salvato con la nuova forma di:",
  fileExportGLBMultires: "Scolpiti a risoluzione più alta, salvati alla densità originale della mesh (i dettagli più fini si perdono: esporta in OBJ per tenerli):",
  fileExportGLBSkipped: "Lasciati com'erano:",
  fileExportSGL: 'Salva .sgl (SculptGL)',
  fileExportOBJ: 'Salva .obj',
  fileExportPLY: 'Salva .ply',
  fileExportSTL: 'Salva .stl',

  fileExportTextureTitle: 'Esporta textures',
  fileExportTextureSize: 'Dimensione',
  fileExportColor: 'Salva diffuse',
  fileExportRoughness: 'Salva roughness',
  fileExportMetalness: 'Salva metalness',

  // scene
  sceneTitle: 'Scena',
  sceneReset: 'Pulisci scena',
  sceneResetConfirm: 'Conferma pulitura scena',
  sceneAddSphere: 'Aggiungi sfera',
  sceneAddCube: 'Aggiungi cubo',
  sceneAddCylinder: 'Aggiungi cilindro',
  sceneAddTorus: 'Aggiungi toroide',
  sceneSelection: 'Selezione',
  sceneMerge: 'Unisci selezione',
  sceneDuplicate: 'Copia selezione',
  sceneDelete: 'Elimina selezione',

  // mesh
  meshTitle: 'Mesh',
  meshNbVertices: 'Vertex : ',
  meshNbFaces: 'Faces : ',

  // topology
  topologyTitle: 'Topologia',

  //multires
  multiresTitle: 'Multirisoluzione',
  multiresSubdivide: 'Suddivisione',
  multiresReverse: 'Invertire',
  multiresResolution: 'Risoluzione',
  multiresNoLower: 'Non esiste un livello di risoluzione inferiore.',
  multiresNoHigher: 'Non esiste un livello di risoluzione più alto.',
  multiresDelHigher: 'Elimina superiore',
  multiresDelLower: 'Elimina inferiore',
  multiresSelectLowest: 'Selezionare la risoluzione più bassa prima di invertire.',
  multiresSelectHighest: 'Seleziona la risoluzione più alta prima di suddividere.',
  multiresWarnBigMesh: function (nbFacesNext) {
    return 'Il livello di suddivisione successivo raggiungerà ' + nbFacesNext + ' facce.\n' +
      'Se sai cosa stai facendo, clicca di nuovo su "Suddividi".';
  },
  multiresNotReversible: 'Spiacenti, non è possibile invertire questa mesh.\n' +
    'La mesh non è un prodotto di una superficie di suddivisione (loop-catmull) su una mesh collettore.',

  // remesh
  remeshTitle: 'Voxel remeshing (quads)',
  remeshRemesh: 'Remesh',
  remeshResolution: 'Risolutione',
  remeshBlock: 'Blocca',

  // dynamic
  dynamicTitle: 'Topologia Dinamica',
  dynamicActivated: 'Attivata (no quads)',
  dynamicSubdivision: 'Suddivisione',
  dynamicDecimation: 'Decimazione',
  dynamicLinear: 'Suddivisione Lineare',

  // sculpt
  sculptTitle: 'Scalpisci & Dipingi',
  sculptBrush: 'Spazzola',
  sculptInflate: 'Gonfia',
  sculptTwist: 'Torci',
  sculptSmooth: 'Ammorbidisci (-Shift)',
  sculptFlatten: 'Appiattisci',
  sculptPinch: 'Pizzica',
  sculptCrease: 'Piega',
  sculptDrag: 'Trascina',
  sculptPaint: 'Dipingi',
  sculptMasking: 'Maschera (-Ctrl)',
  sculptMove: 'Muovi',
  sculptLocalScale: 'Scala Locale',
  sculptTransform: 'Trasformazioni (E)',

  sculptCommon: 'Comune',
  sculptTool: 'Strumento',
  sculptSymmetry: 'Simmetria',
  sculptContinuous: 'Continua',
  sculptRadius: 'Raggio (-X)',
  sculptIntensity: 'Intensità (-C)',
  sculptHardness: 'Durezza',
  sculptCulling: 'Superficie sottile (solo vertici frontali)',
  sculptAlphaTitle: 'Alpha',
  sculptLockPositon: 'Blocca posizione',
  sculptAlphaTex: 'Texture',
  sculptImportAlpha: 'Importa alpha tex (jpg, png...)',
  sculptNegative: 'Negativo (N or -Alt)',
  sculptColor: 'Albedo',
  sculptRoughness: 'Rugosità',
  sculptMetallic: 'Metallico',
  sculptClay: 'Clay',
  sculptAccumulate: 'Accumulazione (no limit per stroke)',
  sculptColorGlobal: 'Globale',
  sculptPickColor: 'Materiale / Color picker (-S)',
  sculptTangentialSmoothing: 'Solo Relax',
  sculptTopologicalCheck: 'Controllo Topologia',
  sculptMoveAlongNormal: 'Muovi lungo la normale (N o -Alt)',
  sculptMaskingClear: 'Pulisci (-Ctrl + Drag)',
  sculptMaskingInvert: 'Inverti (-Ctrl + Click)',
  sculptMaskingBlur: 'Sfoca',
  sculptMaskingSharpen: 'Nitidezza',
  sculptPBRTitle: 'Materiali PBR',
  sculptPaintAll: 'Dipingi tutto',
  sculptExtractTitle: 'Estrazione',
  sculptExtractThickness: 'Assottigliamento',
  sculptExtractAction: 'Estrai !',

  // states
  stateTitle: 'Cronologia',
  stateUndo: 'Indietro',
  stateRedo: 'Avanti',
  stateRestore: "Ripristina originale",
  stateRestoreNone: "Niente da ripristinare: apri prima un file.",
  stateMaxStack: 'Pila massima',

  // pressure
  pressureTitle: 'Pressione tavoletta',
  pressureRadius: 'Raggio pressione',
  pressureIntensity: 'Intensità pressione',

  // rendering
  renderingTitle: 'Rendering',
  renderingGrid: 'Vedi Griglia',
  renderingSymmetryLine: 'Vedi linea di specchiatura',
  renderingMatcap: 'Matcap',
  renderingCurvature: 'Curvature',
  renderingPBR: 'PBR',
  renderingTransparency: 'Trasparenza',
  renderingNormal: 'Normal shader',
  renderingUV: 'UV shader',
  renderingShader: 'Shader',
  renderingMaterial: 'Materiale',
  renderingImportUV: 'Importa (jpg, png...)',
  renderingImportMatcap: 'Importa (jpg, png...)',
  renderingExtra: 'Extra',
  renderingFlat: 'Shading piatto',
  renderingWireframe: 'Wireframe (W)',
  renderingExposure: 'Esposizione',
  renderingEnvironment: 'Ambiente',
  renderingIsolate: 'Isola/Vedi (I)',
  renderingFilmic: 'Coloritura tipo Film',

  // contour
  contour: 'Contorno',
  contourShow: 'Vedi contorno',
  contourColor: 'Colore',
  darkenUnselected: 'Scurisci i non selezionati',

  // pixel ratio
  resolution: 'Risolutione',

  // matcaps
  matcapPearl: 'Perla',
  matcapClay: 'Argilla',
  matcapSkin: 'Pelle',
  matcapGreen: 'Verde',
  matcapWhite: 'Bianco',

  // sketchfab
  sketchfabTitle: 'Vai su Sketchfab !',
  sketchfabUpload: 'Upload',
  sketchfabUploadMessage: 'Inserisci la tua chiave API di sketchfab.\n' +
    'Puoi anche lasciare "guest" per caricare in modo anonimo.\n' +
    '(verrà visualizzata una nuova finestra al termine del caricamento e dell\'elaborazione)',
  sketchfabUploadError: function (error) {
    return 'Sketchfab errore upload :\n' + error;
  },
  sketchfabUploadSuccess: 'Caricato con successo !\nEcco il tuo link :',
  sketchfabAbort: 'Annulla l\'ultimo caricamento?',
  sketchfabUploadProcessing: 'Processing...\nIl tuo modello sarà disponibile su :',

  about: 'Informazioni & Aiuto',

  alphaNone: 'Nessuno',
  alphaSquare: 'Quadrata',
  alphaSkin: 'Pelle',

  remeshTitleMC: 'Voxel remeshing (manifold tris)',
  remeshRemeshMC: 'Remesh',
  remeshSmoothingMC: 'Relax topology',

  // phone / tablet quick bar
  mobileMenu: 'Menu',
  mobileTools: 'Strumenti',
  mobileUndo: 'Annulla',
  mobileRedo: 'Ripeti',
  mobileView: 'Ruota vista',

  // touch pen and per-tool hints
  penGlow: "Zona di luce sul modello",
  penLockedPiece: "pezzo scelto",
  penTitle: "Penna (tocco)",
  penEnabled: "Penna accanto al dito",
  penHand: "Mano",
  penHandRight: "Destra",
  penHandLeft: "Sinistra",
  penDistance: "Lunghezza penna",
  penAim: "Mira, poi tieni fermo per scolpire",
  penHold: "Attesa (ms)",
  penLock: "Blocca pezzo (scolpisci solo quello scelto)",
  hintBrush: "Spazzola: passa sopra la zona per aggiungere materiale, in qualsiasi direzione. Con − scava.",
  hintInflate: "Gonfia: passa sopra la zona per gonfiarla (con − sgonfia), in qualsiasi direzione.",
  hintTwist: "Torci: tieni la punta su un punto e gira attorno.",
  hintSmooth: "Ammorbidisci: passa sopra i bozzi per levigarli, in qualsiasi direzione.",
  hintFlatten: "Appiattisci: passa sopra la zona per spianarla, in qualsiasi direzione.",
  hintPinch: "Pizzica: scorri lungo uno spigolo per stringerlo e renderlo netto.",
  hintCrease: "Piega: traccia una linea, la piega segue il percorso.",
  hintDrag: "Trascina: la superficie segue la punta nella direzione in cui muovi.",
  hintPaint: "Dipingi: passa sopra la zona per colorarla (colore in Strumenti ⚙).",
  hintMove: "Muovi: appoggia e fai scorrere, la zona va dove vai tu.",
  hintMasking: "Maschera: passa sopra una zona per proteggerla dalle modifiche.",
  hintLocalScale: "Scala locale: muovi a destra per ingrandire, a sinistra per rimpicciolire.",
  hintTransform: "Trasformazioni: usa le maniglie colorate per spostare, ruotare o scalare il pezzo.",

  // empty scene
  welcomeTitle: "Apri un modello",
  welcomeFormats: "GLB, VRM, OBJ, STL, PLY o SGL, oppure trascina qui il file.",
  welcomeOpen: "Apri file",
  welcomeSphere: "Inizia da una sfera"
};

export default TR;

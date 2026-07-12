const SUPPORTED_LANGS = ['ja', 'en', 'th', 'id', 'zh'];
const STORAGE_KEY = 'br_lang';

const I18N = {
  ja: {
    title:              'Product Photo Cleaner',
    eyebrow:            'Factory Tools / Browser only',
    subtitle:           '画像をサーバーへ送らず、ブラウザ内で背景除去とマスク修正を行います。',
    langLabel:          '言語',

    exportBg_transparent: '透明PNG',
    exportBg_white:       '白背景PNG',
    exportBg_black:       '黒背景PNG',
    exportBg_gray:        '検査グレーPNG',

    size_high:     '高画質',
    size_standard: '標準',
    size_light:    '軽量',

    btnCopy: 'コピー',
    btnSave: 'PNG保存',

    uploadTitle: '画像をアップロード',
    uploadHint:  'PNG / JPG / JPEG。初回のみモデルをダウンロードします。',
    btnSelect:   'ファイルを選択',
    statusInit:  '画像はまだ選択されていません。',

    maskTitle:  'マスク修正',
    islandLabel: '島: -',
    toolHelp:   '消えた部品は「点で囲んで戻す」で外周をクリックし、キャンバス内の「囲みを実行」で戻します。余計な背景は「点で囲んで消す」で同じように消せます。',

    tool_toggle: '島を切替',
    tool_polyFg: '点で囲んで戻す',
    tool_polyBg: '点で囲んで消す',
    tool_pan:    'パン',

    showBoundaryLabel: '境界線を表示',

    btnUndo:    'Undo',
    btnRedo:    'Redo',
    btnRelabel: '島を再計算',

    netTitle: 'ネットワークについて',
    netNote:  '画像データは送信しません。モデルファイルの初回ダウンロードのみ通信が発生します。',

    preview_compare: '元画像 + 結果',
    preview_checker: '結果のみ',
    preview_original:'元画像',

    btnApplyPolygon: '囲みを実行',
    btnUndoPoint:    '点を戻す',
    btnClearPolygon: '囲みをクリア',

    btnZoomReset: '全体表示',

    emptyTitle: '完全ブラウザ内で処理',
    emptyHint:  '画像を選ぶと、ブラウザ内で背景除去モデルを実行します。',

    historyTitle:    '履歴',
    btnClearHistory: '全削除',
    historyEmpty:    '履歴はまだありません。',

    histActionCopy:   'コピー',
    histActionSave:   '保存',
    histActionDelete: '削除',

    toast_invalidFile:    'PNG / JPG / JPEG を選択してください。',
    toast_bgRemoved:      '背景削除が完了しました。',
    toast_failed:         '処理に失敗しました。',
    toast_bigRegion:      '大きな背景領域です。必要な部分だけ点で囲んで戻してください。',
    toast_islandRemoved:  '選択した島を消しました。',
    toast_islandRestored: '選択した島を戻しました。',
    toast_polyFg:         '囲んだ内側をすべて戻しました。',
    toast_polyBg:         '囲んだ内側をすべて消しました。',
    toast_saved:          'PNGを保存しました。',
    toast_savedHistory:   'PNGを保存し、履歴に追加しました。',
    toast_noCopy:         'このブラウザは画像コピーに対応していません。',
    toast_copied:         'クリップボードへコピーしました。',
    toast_copiedHistory:  'コピーし、履歴に追加しました。',
    toast_copyFail:       'コピーに失敗しました。',
    toast_histCopied:     '履歴からコピーしました。',
    toast_histSaved:      '履歴からPNGを保存しました。',
    toast_histDeleted:    '履歴を削除しました。',
    toast_histCleared:    '履歴をすべて削除しました。',
    toast_histFail:       '履歴保存に失敗しました。',
    toast_histNoSupport:  'このブラウザは履歴保存に対応していません。',
    toast_relabeled:      '島を再計算しました。',
    toast_convertFail:    '画像の変換に失敗しました。',
    toast_histOn:         '履歴保存をONにしました。',
    toast_histOff:        '履歴保存をOFFにしました。',
    toast_copyHint:       'コピーできませんでした。キャンバスを右クリックして「画像をコピー」を選択してください。',

    status_loading:  '画像を読み込んでいます。',
    status_removing: 'ブラウザ内モデルで背景を削除しています。',
    status_masking:  'マスクを作成しています。',
    status_done:     '処理完了',

    bg_transparent: '透明',
    bg_white:       '白背景',
    bg_black:       '黒背景',
    bg_gray:        '検査グレー',

    kind_fg: '前景',
    kind_bg: '背景',

    island_count:  '島: {n}',
    island_detail: '島: {id} / {kind} / {px}px',
    island_none:   '島: -',
  },

  en: {
    title:              'Product Photo Cleaner',
    eyebrow:            'Factory Tools / Browser only',
    subtitle:           'Remove backgrounds and edit masks entirely in-browser — no server upload.',
    langLabel:          'Language',

    exportBg_transparent: 'Transparent PNG',
    exportBg_white:       'White BG PNG',
    exportBg_black:       'Black BG PNG',
    exportBg_gray:        'Inspection Gray PNG',

    size_high:     'High quality',
    size_standard: 'Standard',
    size_light:    'Light',

    btnCopy: 'Copy',
    btnSave: 'Save PNG',

    uploadTitle: 'Upload image',
    uploadHint:  'PNG / JPG / JPEG. Model is downloaded on first use.',
    btnSelect:   'Select file',
    statusInit:  'No image selected.',

    maskTitle:  'Mask editing',
    islandLabel: 'Islands: -',
    toolHelp:   'To restore a missing part, click "Restore by polygon" and click around its outline, then click "Apply polygon" on the canvas. To erase unwanted background, use "Erase by polygon" the same way.',

    tool_toggle: 'Toggle island',
    tool_polyFg: 'Restore by polygon',
    tool_polyBg: 'Erase by polygon',
    tool_pan:    'Pan',

    showBoundaryLabel: 'Show boundary',

    btnUndo:    'Undo',
    btnRedo:    'Redo',
    btnRelabel: 'Recompute islands',

    netTitle: 'About network usage',
    netNote:  'No image data is transmitted. Only the model file is downloaded on first use.',

    preview_compare:  'Original + Result',
    preview_checker:  'Result only',
    preview_original: 'Original',

    btnApplyPolygon: 'Apply polygon',
    btnUndoPoint:    'Undo point',
    btnClearPolygon: 'Clear polygon',

    btnZoomReset: 'Fit view',

    emptyTitle: 'Fully in-browser processing',
    emptyHint:  'Select an image and the background removal model runs locally in your browser.',

    historyTitle:    'History',
    btnClearHistory: 'Clear all',
    historyEmpty:    'No history yet.',

    histActionCopy:   'Copy',
    histActionSave:   'Save',
    histActionDelete: 'Delete',

    toast_invalidFile:    'Please select a PNG / JPG / JPEG file.',
    toast_bgRemoved:      'Background removal complete.',
    toast_failed:         'Processing failed.',
    toast_bigRegion:      'Large background region. Use "Restore by polygon" to outline just the part you need.',
    toast_islandRemoved:  'Island removed.',
    toast_islandRestored: 'Island restored.',
    toast_polyFg:         'Area inside polygon restored.',
    toast_polyBg:         'Area inside polygon erased.',
    toast_saved:          'PNG saved.',
    toast_savedHistory:   'PNG saved and added to history.',
    toast_noCopy:         'This browser does not support image copy.',
    toast_copied:         'Copied to clipboard.',
    toast_copiedHistory:  'Copied and added to history.',
    toast_copyFail:       'Copy failed.',
    toast_histCopied:     'Copied from history.',
    toast_histSaved:      'PNG saved from history.',
    toast_histDeleted:    'History item deleted.',
    toast_histCleared:    'All history cleared.',
    toast_histFail:       'Failed to save history.',
    toast_histNoSupport:  'This browser does not support history saving.',
    toast_relabeled:      'Islands recomputed.',
    toast_convertFail:    'Image conversion failed.',
    toast_histOn:         'History saving enabled.',
    toast_histOff:        'History saving disabled.',
    toast_copyHint:       'Copy failed. Right-click the canvas and choose "Copy Image".',

    status_loading:  'Loading image…',
    status_removing: 'Removing background in-browser…',
    status_masking:  'Building mask…',
    status_done:     'Done',

    bg_transparent: 'Transparent',
    bg_white:       'White BG',
    bg_black:       'Black BG',
    bg_gray:        'Inspection gray',

    kind_fg: 'foreground',
    kind_bg: 'background',

    island_count:  'Islands: {n}',
    island_detail: 'Island: {id} / {kind} / {px}px',
    island_none:   'Islands: -',
  },

  th: {
    title:              'Product Photo Cleaner',
    eyebrow:            'Factory Tools / Browser only',
    subtitle:           'ลบพื้นหลังและแก้ไขมาสก์ในเบราว์เซอร์ ไม่ส่งภาพขึ้นเซิร์ฟเวอร์',
    langLabel:          'ภาษา',

    exportBg_transparent: 'PNG โปร่งใส',
    exportBg_white:       'PNG พื้นขาว',
    exportBg_black:       'PNG พื้นดำ',
    exportBg_gray:        'PNG สีเทาตรวจสอบ',

    size_high:     'คุณภาพสูง',
    size_standard: 'มาตรฐาน',
    size_light:    'เบา',

    btnCopy: 'คัดลอก',
    btnSave: 'บันทึก PNG',

    uploadTitle: 'อัปโหลดภาพ',
    uploadHint:  'PNG / JPG / JPEG ดาวน์โหลดโมเดลครั้งแรกเท่านั้น',
    btnSelect:   'เลือกไฟล์',
    statusInit:  'ยังไม่ได้เลือกภาพ',

    maskTitle:  'แก้ไขมาสก์',
    islandLabel: 'ไอแลนด์: -',
    toolHelp:   'ใช้ "กู้คืนด้วยรูปหลายเหลี่ยม" คลิกรอบชิ้นส่วนที่หายไป แล้วคลิก "ใช้รูปหลายเหลี่ยม" เพื่อกู้คืน ใช้ "ลบด้วยรูปหลายเหลี่ยม" เพื่อลบพื้นหลังที่ไม่ต้องการ',

    tool_toggle: 'สลับไอแลนด์',
    tool_polyFg: 'กู้คืนด้วยรูปหลายเหลี่ยม',
    tool_polyBg: 'ลบด้วยรูปหลายเหลี่ยม',
    tool_pan:    'เลื่อน',

    showBoundaryLabel: 'แสดงขอบเขต',

    btnUndo:    'เลิกทำ',
    btnRedo:    'ทำซ้ำ',
    btnRelabel: 'คำนวณไอแลนด์ใหม่',

    netTitle: 'เกี่ยวกับเครือข่าย',
    netNote:  'ไม่มีการส่งข้อมูลภาพ ดาวน์โหลดเฉพาะไฟล์โมเดลครั้งแรกเท่านั้น',

    preview_compare:  'ต้นฉบับ + ผลลัพธ์',
    preview_checker:  'ผลลัพธ์เท่านั้น',
    preview_original: 'ต้นฉบับ',

    btnApplyPolygon: 'ใช้รูปหลายเหลี่ยม',
    btnUndoPoint:    'เลิกทำจุด',
    btnClearPolygon: 'ล้างรูปหลายเหลี่ยม',

    btnZoomReset: 'พอดีมุมมอง',

    emptyTitle: 'ประมวลผลในเบราว์เซอร์',
    emptyHint:  'เลือกภาพแล้วโมเดลจะทำงานในเบราว์เซอร์ของคุณ',

    historyTitle:    'ประวัติ',
    btnClearHistory: 'ล้างทั้งหมด',
    historyEmpty:    'ยังไม่มีประวัติ',

    histActionCopy:   'คัดลอก',
    histActionSave:   'บันทึก',
    histActionDelete: 'ลบ',

    toast_invalidFile:    'กรุณาเลือกไฟล์ PNG / JPG / JPEG',
    toast_bgRemoved:      'ลบพื้นหลังเสร็จสิ้น',
    toast_failed:         'การประมวลผลล้มเหลว',
    toast_bigRegion:      'พื้นที่พื้นหลังใหญ่ ใช้ "กู้คืนด้วยรูปหลายเหลี่ยม" เพื่อวาดรอบส่วนที่ต้องการ',
    toast_islandRemoved:  'ลบไอแลนด์แล้ว',
    toast_islandRestored: 'กู้คืนไอแลนด์แล้ว',
    toast_polyFg:         'กู้คืนพื้นที่ในรูปหลายเหลี่ยมแล้ว',
    toast_polyBg:         'ลบพื้นที่ในรูปหลายเหลี่ยมแล้ว',
    toast_saved:          'บันทึก PNG แล้ว',
    toast_savedHistory:   'บันทึก PNG และเพิ่มในประวัติแล้ว',
    toast_noCopy:         'เบราว์เซอร์นี้ไม่รองรับการคัดลอกภาพ',
    toast_copied:         'คัดลอกไปยังคลิปบอร์ดแล้ว',
    toast_copiedHistory:  'คัดลอกและเพิ่มในประวัติแล้ว',
    toast_copyFail:       'การคัดลอกล้มเหลว',
    toast_histCopied:     'คัดลอกจากประวัติแล้ว',
    toast_histSaved:      'บันทึก PNG จากประวัติแล้ว',
    toast_histDeleted:    'ลบรายการประวัติแล้ว',
    toast_histCleared:    'ล้างประวัติทั้งหมดแล้ว',
    toast_histFail:       'บันทึกประวัติล้มเหลว',
    toast_histNoSupport:  'เบราว์เซอร์นี้ไม่รองรับการบันทึกประวัติ',
    toast_relabeled:      'คำนวณไอแลนด์ใหม่แล้ว',
    toast_convertFail:    'การแปลงภาพล้มเหลว',
    toast_histOn:         'เปิดการบันทึกประวัติแล้ว',
    toast_histOff:        'ปิดการบันทึกประวัติแล้ว',
    toast_copyHint:       'คัดลอกไม่สำเร็จ คลิกขวาที่ Canvas แล้วเลือก "คัดลอกภาพ"',

    status_loading:  'กำลังโหลดภาพ…',
    status_removing: 'กำลังลบพื้นหลังในเบราว์เซอร์…',
    status_masking:  'กำลังสร้างมาสก์…',
    status_done:     'เสร็จสิ้น',

    bg_transparent: 'โปร่งใส',
    bg_white:       'พื้นขาว',
    bg_black:       'พื้นดำ',
    bg_gray:        'สีเทาตรวจสอบ',

    kind_fg: 'พื้นหน้า',
    kind_bg: 'พื้นหลัง',

    island_count:  'ไอแลนด์: {n}',
    island_detail: 'ไอแลนด์: {id} / {kind} / {px}px',
    island_none:   'ไอแลนด์: -',
  },

  id: {
    title:              'Product Photo Cleaner',
    eyebrow:            'Factory Tools / Browser only',
    subtitle:           'Hapus latar belakang dan edit masker sepenuhnya di browser — tanpa unggah ke server.',
    langLabel:          'Bahasa',

    exportBg_transparent: 'PNG Transparan',
    exportBg_white:       'PNG Latar Putih',
    exportBg_black:       'PNG Latar Hitam',
    exportBg_gray:        'PNG Abu-abu Inspeksi',

    size_high:     'Kualitas tinggi',
    size_standard: 'Standar',
    size_light:    'Ringan',

    btnCopy: 'Salin',
    btnSave: 'Simpan PNG',

    uploadTitle: 'Unggah gambar',
    uploadHint:  'PNG / JPG / JPEG. Model diunduh saat pertama kali digunakan.',
    btnSelect:   'Pilih file',
    statusInit:  'Belum ada gambar dipilih.',

    maskTitle:  'Edit masker',
    islandLabel: 'Pulau: -',
    toolHelp:   'Untuk memulihkan bagian yang hilang, klik "Pulihkan dengan poligon" lalu klik sekeliling tepinya, kemudian klik "Terapkan poligon" di kanvas. Untuk menghapus latar yang tidak diinginkan, gunakan "Hapus dengan poligon" dengan cara yang sama.',

    tool_toggle: 'Ganti pulau',
    tool_polyFg: 'Pulihkan dengan poligon',
    tool_polyBg: 'Hapus dengan poligon',
    tool_pan:    'Geser',

    showBoundaryLabel: 'Tampilkan batas',

    btnUndo:    'Batalkan',
    btnRedo:    'Ulangi',
    btnRelabel: 'Hitung ulang pulau',

    netTitle: 'Tentang jaringan',
    netNote:  'Tidak ada data gambar yang dikirim. Hanya file model yang diunduh saat pertama kali digunakan.',

    preview_compare:  'Asli + Hasil',
    preview_checker:  'Hasil saja',
    preview_original: 'Asli',

    btnApplyPolygon: 'Terapkan poligon',
    btnUndoPoint:    'Batalkan titik',
    btnClearPolygon: 'Hapus poligon',

    btnZoomReset: 'Sesuaikan tampilan',

    emptyTitle: 'Pemrosesan penuh di browser',
    emptyHint:  'Pilih gambar dan model penghapusan latar akan berjalan di browser Anda.',

    historyTitle:    'Riwayat',
    btnClearHistory: 'Hapus semua',
    historyEmpty:    'Belum ada riwayat.',

    histActionCopy:   'Salin',
    histActionSave:   'Simpan',
    histActionDelete: 'Hapus',

    toast_invalidFile:    'Pilih file PNG / JPG / JPEG.',
    toast_bgRemoved:      'Penghapusan latar selesai.',
    toast_failed:         'Pemrosesan gagal.',
    toast_bigRegion:      'Area latar yang besar. Gunakan "Pulihkan dengan poligon" untuk membingkai bagian yang diperlukan.',
    toast_islandRemoved:  'Pulau dihapus.',
    toast_islandRestored: 'Pulau dipulihkan.',
    toast_polyFg:         'Area di dalam poligon dipulihkan.',
    toast_polyBg:         'Area di dalam poligon dihapus.',
    toast_saved:          'PNG disimpan.',
    toast_savedHistory:   'PNG disimpan dan ditambahkan ke riwayat.',
    toast_noCopy:         'Browser ini tidak mendukung salin gambar.',
    toast_copied:         'Disalin ke papan klip.',
    toast_copiedHistory:  'Disalin dan ditambahkan ke riwayat.',
    toast_copyFail:       'Gagal menyalin.',
    toast_histCopied:     'Disalin dari riwayat.',
    toast_histSaved:      'PNG disimpan dari riwayat.',
    toast_histDeleted:    'Item riwayat dihapus.',
    toast_histCleared:    'Semua riwayat dihapus.',
    toast_histFail:       'Gagal menyimpan riwayat.',
    toast_histNoSupport:  'Browser ini tidak mendukung penyimpanan riwayat.',
    toast_relabeled:      'Pulau dihitung ulang.',
    toast_convertFail:    'Konversi gambar gagal.',
    toast_histOn:         'Penyimpanan riwayat diaktifkan.',
    toast_histOff:        'Penyimpanan riwayat dinonaktifkan.',
    toast_copyHint:       'Gagal menyalin. Klik kanan kanvas dan pilih "Salin Gambar".',

    status_loading:  'Memuat gambar…',
    status_removing: 'Menghapus latar di browser…',
    status_masking:  'Membuat masker…',
    status_done:     'Selesai',

    bg_transparent: 'Transparan',
    bg_white:       'Latar putih',
    bg_black:       'Latar hitam',
    bg_gray:        'Abu-abu inspeksi',

    kind_fg: 'latar depan',
    kind_bg: 'latar belakang',

    island_count:  'Pulau: {n}',
    island_detail: 'Pulau: {id} / {kind} / {px}px',
    island_none:   'Pulau: -',
  },

  zh: {
    title:              'Product Photo Cleaner',
    eyebrow:            'Factory Tools / Browser only',
    subtitle:           '完全在浏览器内去除背景并编辑蒙版，无需上传至服务器。',
    langLabel:          '语言',

    exportBg_transparent: '透明PNG',
    exportBg_white:       '白色背景PNG',
    exportBg_black:       '黑色背景PNG',
    exportBg_gray:        '检验灰色PNG',

    size_high:     '高画质',
    size_standard: '标准',
    size_light:    '轻量',

    btnCopy: '复制',
    btnSave: '保存PNG',

    uploadTitle: '上传图片',
    uploadHint:  'PNG / JPG / JPEG。仅首次使用时下载模型。',
    btnSelect:   '选择文件',
    statusInit:  '尚未选择图片。',

    maskTitle:  '蒙版编辑',
    islandLabel: '区块: -',
    toolHelp:   '要恢复丢失的部件，点击"多边形恢复"并点击其轮廓，然后在画布中点击"应用多边形"。要擦除多余背景，用"多边形擦除"以相同方式操作。',

    tool_toggle: '切换区块',
    tool_polyFg: '多边形恢复',
    tool_polyBg: '多边形擦除',
    tool_pan:    '平移',

    showBoundaryLabel: '显示边界',

    btnUndo:    '撤销',
    btnRedo:    '重做',
    btnRelabel: '重新计算区块',

    netTitle: '关于网络',
    netNote:  '不会发送图片数据。仅首次使用时下载模型文件。',

    preview_compare:  '原图 + 结果',
    preview_checker:  '仅结果',
    preview_original: '原图',

    btnApplyPolygon: '应用多边形',
    btnUndoPoint:    '撤销点',
    btnClearPolygon: '清除多边形',

    btnZoomReset: '适应视图',

    emptyTitle: '完全在浏览器内处理',
    emptyHint:  '选择图片后，背景去除模型将在您的浏览器中本地运行。',

    historyTitle:    '历史记录',
    btnClearHistory: '全部删除',
    historyEmpty:    '暂无历史记录。',

    histActionCopy:   '复制',
    histActionSave:   '保存',
    histActionDelete: '删除',

    toast_invalidFile:    '请选择 PNG / JPG / JPEG 文件。',
    toast_bgRemoved:      '背景去除完成。',
    toast_failed:         '处理失败。',
    toast_bigRegion:      '背景区域较大。请用"多边形恢复"圈出所需部分。',
    toast_islandRemoved:  '已删除区块。',
    toast_islandRestored: '已恢复区块。',
    toast_polyFg:         '多边形内区域已恢复。',
    toast_polyBg:         '多边形内区域已擦除。',
    toast_saved:          'PNG已保存。',
    toast_savedHistory:   'PNG已保存并添加到历史记录。',
    toast_noCopy:         '此浏览器不支持图片复制。',
    toast_copied:         '已复制到剪贴板。',
    toast_copiedHistory:  '已复制并添加到历史记录。',
    toast_copyFail:       '复制失败。',
    toast_histCopied:     '已从历史记录复制。',
    toast_histSaved:      '已从历史记录保存PNG。',
    toast_histDeleted:    '已删除历史记录项。',
    toast_histCleared:    '已清除所有历史记录。',
    toast_histFail:       '历史记录保存失败。',
    toast_histNoSupport:  '此浏览器不支持历史记录保存。',
    toast_relabeled:      '已重新计算区块。',
    toast_convertFail:    '图片转换失败。',
    toast_histOn:         '已启用历史记录保存。',
    toast_histOff:        '已禁用历史记录保存。',
    toast_copyHint:       '复制失败。请右键单击画布并选择"拷贝图像"。',

    status_loading:  '正在加载图片…',
    status_removing: '正在浏览器内去除背景…',
    status_masking:  '正在构建蒙版…',
    status_done:     '完成',

    bg_transparent: '透明',
    bg_white:       '白色背景',
    bg_black:       '黑色背景',
    bg_gray:        '检验灰色',

    kind_fg: '前景',
    kind_bg: '背景',

    island_count:  '区块: {n}',
    island_detail: '区块: {id} / {kind} / {px}px',
    island_none:   '区块: -',
  },
};

let currentLang = 'ja';

export function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) ||
         (I18N.en[key]) ||
         key;
}

export function applyLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = 'en';
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });

  const sel = document.getElementById('lang-select');
  if (sel) sel.value = lang;
}

export function initI18n() {
  const params = new URLSearchParams(location.search);
  const urlLang = params.get('lang');
  const storedLang = localStorage.getItem(STORAGE_KEY);
  const browserLang = (navigator.language || '').slice(0, 2);
  const initLang = urlLang || storedLang || (SUPPORTED_LANGS.includes(browserLang) ? browserLang : 'ja');
  applyLanguage(initLang);
}

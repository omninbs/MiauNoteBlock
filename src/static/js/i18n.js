/* WebNBS interface locale selection. Only the supported, well-formed locales are accepted. */
(function() {
    'use strict';

    var STORAGE_KEY = 'webnbs_language';
    var SUPPORTED = ['zh-CN', 'en-US', 'es-ES', 'pt-BR', 'ru-RU', 'de-DE', 'fr-FR', 'ja-JP', 'ko-KR', 'id-ID'];
    // Keep both the Chinese source and the last rendered value. UI state is
    // updated frequently (counts, device names, etc.), so a plain source string
    // would otherwise leave dynamic content stuck on an old translation.
    var sourceText = new WeakMap();
    var current;

    var TEXT = {
        'zh-CN': {
            page_title: 'NoteBlockWeb - Minecraft 音符盒编辑器', language: '语言', settings: '设置', about: '关于', functions: '功能',
            privacy_title: '隐私声明', privacy_message: '本服务仅在当前会话中临时处理您选择的 MIDI 或 NBS 文件。文件内容不会被永久保存，也不会收集个人隐私信息。',
            agree: '同意', feedback: '反馈邮箱', open_source: '开源库', update_notes: '更新日志', close: '关闭', file: '文件', keyboard_piano: '钢琴键盘', midi_import: 'MIDI 导入'
        },
        'en-US': {
            page_title: 'NoteBlockWeb - Minecraft Note Block Editor', language: 'Language', settings: 'Settings', about: 'About', functions: 'Tools',
            privacy_title: 'Privacy Notice', privacy_message: 'This service processes the MIDI or NBS file you choose only for the current session. File contents are not stored permanently and no personal data is collected.',
            agree: 'Agree', feedback: 'Feedback', open_source: 'Open-source libraries', update_notes: "What's new", close: 'Close', file: 'File', keyboard_piano: 'Piano keyboard', midi_import: 'Import MIDI'
        },
        'pt-BR': {
            page_title: 'NoteBlockWeb - Editor de Blocos de Nota do Minecraft', language: 'Idioma', settings: 'Configurações', about: 'Sobre', functions: 'Ferramentas',
            privacy_title: 'Aviso de privacidade', privacy_message: 'Este serviço processa o arquivo MIDI ou NBS escolhido apenas durante a sessão atual. O conteúdo não é armazenado permanentemente e nenhum dado pessoal é coletado.',
            agree: 'Concordo', feedback: 'Contato', open_source: 'Bibliotecas de código aberto', update_notes: 'Novidades', close: 'Fechar', file: 'Arquivo', keyboard_piano: 'Teclado de piano', midi_import: 'Importar MIDI'
        },
        'id-ID': {
            page_title: 'NoteBlockWeb - Editor Blok Nada Minecraft', language: 'Bahasa', settings: 'Pengaturan', about: 'Tentang', functions: 'Alat',
            privacy_title: 'Pemberitahuan privasi', privacy_message: 'Layanan ini memproses berkas MIDI atau NBS yang Anda pilih hanya selama sesi saat ini. Isi berkas tidak disimpan secara permanen dan data pribadi tidak dikumpulkan.',
            agree: 'Setuju', feedback: 'Umpan balik', open_source: 'Pustaka sumber terbuka', update_notes: 'Catatan pembaruan', close: 'Tutup', file: 'Berkas', keyboard_piano: 'Keyboard piano', midi_import: 'Impor MIDI'
        }
    };

    var UI_TEXT = {
        'en-US': {
            '文件': 'File', '速度': 'Tempo', '撤销': 'Undo', '重做': 'Redo', '设置': 'Settings', '关于': 'About', '功能': 'Tools',
            '撤销 (Ctrl+Z)': 'Undo (Ctrl+Z)', '重做 (Ctrl+Y)': 'Redo (Ctrl+Y)', '速度 (Tick/秒)': 'Tempo (ticks/sec)',
            '更多': 'More', '钢琴键盘': 'Piano keyboard', '使用键盘触发钢琴': 'Use computer keyboard as piano', '折叠音轨列表': 'Collapse track list',
            '默认工具 (D)': 'Default tool (D)', '选择工具 (S)': 'Selection tool (S)', '橡皮擦 (E)': 'Eraser (E)', '画笔 (B)': 'Brush (B)', '演奏模式 (P)': 'Performance mode (P)',
            '播放/暂停 (Space)': 'Play/Pause (Space)', '开始录制 (Space)': 'Start recording (Space)', '停止 (Esc)': 'Stop (Esc)', '选择乐器': 'Select instrument',
            '缩放精度': 'Scale precision', '音调偏移': 'Pitch shift', '延音填充': 'Sustain fill', '清除延音': 'Clear sustain', '上下起伏': 'Arpeggio motion',
            '转8度内': 'Fold to 2 octaves', '音域处理': 'Range processing', '清除空轨道': 'Remove empty tracks', '新建文件': 'New file', '打开文件': 'Open file',
            '保存': 'Save', '导出 NBS': 'Export NBS', '取消': 'Cancel', '导入': 'Import', '基本设置': 'Basic', '音轨': 'Tracks', '音色拟合': 'Timbre fitting',
            '读取音符力度': 'Read note velocity', '音符吸附': 'Note snap', '歌曲精度:': 'Song precision:', '拍子:': 'Beat:', '延音处理:': 'Sustain handling:', '移除无音符轨道': 'Remove empty tracks',
            '全选': 'Select all', '取消选择': 'Deselect', '复制': 'Copy', '剪切': 'Cut', '粘贴': 'Paste', '删除': 'Delete', '更改乐器': 'Change instrument', '更改音量': 'Change volume',
            '静音': 'Mute', '取消静音': 'Unmute', '独奏': 'Solo', '取消独奏': 'Unsolo', '删除音轨': 'Delete track', '上移轨道': 'Move track up', '下移轨道': 'Move track down', '音量:': 'Volume:',
            '打开文件': 'Open file', '新建文件': 'New file', '历史文件': 'History', '暂无历史文件': 'No saved files', '更多...': 'More...', '加载': 'Load', '重命名': 'Rename', '关闭': 'Close',
            '展开/折叠钢琴键盘': 'Show/hide piano keyboard', '设置小键盘弹奏音域': 'Set numpad playing range', '超出范围': 'Out of range', '音符:': 'Notes:', '位置:': 'Position:'
        },
        'pt-BR': {
            '文件': 'Arquivo', '速度': 'Andamento', '撤销': 'Desfazer', '重做': 'Refazer', '设置': 'Configurações', '关于': 'Sobre', '功能': 'Ferramentas',
            '撤销 (Ctrl+Z)': 'Desfazer (Ctrl+Z)', '重做 (Ctrl+Y)': 'Refazer (Ctrl+Y)', '速度 (Tick/秒)': 'Andamento (ticks/s)',
            '更多': 'Mais', '钢琴键盘': 'Teclado de piano', '使用键盘触发钢琴': 'Usar o teclado do computador como piano', '折叠音轨列表': 'Recolher lista de faixas',
            '默认工具 (D)': 'Ferramenta padrão (D)', '选择工具 (S)': 'Ferramenta de seleção (S)', '橡皮擦 (E)': 'Borracha (E)', '画笔 (B)': 'Pincel (B)', '演奏模式 (P)': 'Modo de apresentação (P)',
            '播放/暂停 (Space)': 'Reproduzir/Pausar (Espaço)', '开始录制 (Space)': 'Iniciar gravação (Espaço)', '停止 (Esc)': 'Parar (Esc)', '选择乐器': 'Selecionar instrumento',
            '缩放精度': 'Escalar precisão', '音调偏移': 'Transpor tom', '延音填充': 'Preencher sustain', '清除延音': 'Limpar sustain', '上下起伏': 'Movimento de arpejo',
            '转8度内': 'Dobrar para 2 oitavas', '音域处理': 'Processar extensão', '清除空轨道': 'Remover faixas vazias', '新建文件': 'Novo arquivo', '打开文件': 'Abrir arquivo',
            '保存': 'Salvar', '导出 NBS': 'Exportar NBS', '取消': 'Cancelar', '导入': 'Importar', '基本设置': 'Básico', '音轨': 'Faixas', '音色拟合': 'Ajuste de timbre',
            '读取音符力度': 'Ler velocidade das notas', '音符吸附': 'Quantizar notas', '歌曲精度:': 'Precisão da música:', '拍子:': 'Divisão:', '延音处理:': 'Sustain:', '移除无音符音轨': 'Remover faixas vazias',
            '全选': 'Selecionar tudo', '取消选择': 'Desmarcar', '复制': 'Copiar', '剪切': 'Recortar', '粘贴': 'Colar', '删除': 'Excluir', '更改乐器': 'Alterar instrumento', '更改音量': 'Alterar volume',
            '静音': 'Silenciar', '取消静音': 'Ativar som', '独奏': 'Solo', '取消独奏': 'Cancelar solo', '删除音轨': 'Excluir faixa', '上移轨道': 'Mover faixa para cima', '下移轨道': 'Mover faixa para baixo', '音量:': 'Volume:',
            '打开文件': 'Abrir arquivo', '新建文件': 'Novo arquivo', '历史文件': 'Histórico', '暂无历史文件': 'Nenhum arquivo salvo', '更多...': 'Mais...', '加载': 'Carregar', '重命名': 'Renomear', '关闭': 'Fechar',
            '展开/折叠钢琴键盘': 'Mostrar/ocultar teclado de piano', '设置小键盘弹奏音域': 'Definir extensão do teclado numérico', '超出范围': 'Fora da extensão', '音符:': 'Notas:', '位置:': 'Posição:'
        },
        'id-ID': {
            '文件': 'Berkas', '速度': 'Tempo', '撤销': 'Urungkan', '重做': 'Ulangi', '设置': 'Pengaturan', '关于': 'Tentang', '功能': 'Alat',
            '撤销 (Ctrl+Z)': 'Urungkan (Ctrl+Z)', '重做 (Ctrl+Y)': 'Ulangi (Ctrl+Y)', '速度 (Tick/秒)': 'Tempo (tick/detik)',
            '更多': 'Lainnya', '钢琴键盘': 'Keyboard piano', '使用键盘触发钢琴': 'Gunakan keyboard komputer sebagai piano', '折叠音轨列表': 'Ciutkan daftar trek',
            '默认工具 (D)': 'Alat bawaan (D)', '选择工具 (S)': 'Alat pilih (S)', '橡皮擦 (E)': 'Penghapus (E)', '画笔 (B)': 'Kuas (B)', '演奏模式 (P)': 'Mode pertunjukan (P)',
            '播放/暂停 (Space)': 'Putar/Jeda (Spasi)', '开始录制 (Space)': 'Mulai merekam (Spasi)', '停止 (Esc)': 'Berhenti (Esc)', '选择乐器': 'Pilih instrumen',
            '缩放精度': 'Skalakan presisi', '音调偏移': 'Geser nada', '延音填充': 'Isi sustain', '清除延音': 'Hapus sustain', '上下起伏': 'Gerak arpeggio',
            '转8度内': 'Lipat ke 2 oktaf', '音域处理': 'Proses rentang nada', '清除空轨道': 'Hapus trek kosong', '新建文件': 'Berkas baru', '打开文件': 'Buka berkas',
            '保存': 'Simpan', '导出 NBS': 'Ekspor NBS', '取消': 'Batal', '导入': 'Impor', '基本设置': 'Dasar', '音轨': 'Trek', '音色拟合': 'Pencocokan timbre',
            '读取音符力度': 'Baca velocity not', '音符吸附': 'Kuantisasi not', '歌曲精度:': 'Presisi lagu:', '拍子:': 'Ketukan:', '延音处理:': 'Sustain:', '移除无音符音轨': 'Hapus trek kosong',
            '全选': 'Pilih semua', '取消选择': 'Batalkan pilihan', '复制': 'Salin', '剪切': 'Potong', '粘贴': 'Tempel', '删除': 'Hapus', '更改乐器': 'Ubah instrumen', '更改音量': 'Ubah volume',
            '静音': 'Bisukan', '取消静音': 'Bunyikan', '独奏': 'Solo', '取消独奏': 'Batalkan solo', '删除音轨': 'Hapus trek', '上移轨道': 'Naikkan trek', '下移轨道': 'Turunkan trek', '音量:': 'Volume:',
            '打开文件': 'Buka berkas', '新建文件': 'Berkas baru', '历史文件': 'Riwayat', '暂无历史文件': 'Belum ada berkas tersimpan', '更多...': 'Lainnya...', '加载': 'Muat', '重命名': 'Ubah nama', '关闭': 'Tutup',
            '展开/折叠钢琴键盘': 'Tampilkan/sembunyikan keyboard piano', '设置小键盘弹奏音域': 'Atur jangkauan keypad numerik', '超出范围': 'Di luar jangkauan', '音符:': 'Not:', '位置:': 'Posisi:'
        }
    };

    // Shared editor vocabulary used by settings, import dialogs, context menus and
    // dynamically-created controls. Keeping it here lets MutationObserver translate
    // UI added after the initial page load as well.
    Object.assign(UI_TEXT['en-US'], {
        '平滑翻页 (播放头居中)': 'Smooth follow (center playhead)', '音符播放高亮动画': 'Note playback highlight', '录制时显示音符动画 (关闭可提升录制性能)': 'Show note animation while recording',
        '音效优化 (混响/立体声)': 'Audio enhancement (reverb/stereo)', 'NBS 导出版本:': 'NBS export version:', '含铜号角乐器时自动 V6': 'Use V6 automatically for copper horn instruments',
        '关于 NoteBlockWeb': 'About NoteBlockWeb', '调节速度': 'Adjust tempo', '基于 Web 的 Minecraft 音符盒编辑器': 'A web-based Minecraft note block editor',
        '支持 NBS 格式导入/导出, MIDI 导入, 钢琴卷帘编辑': 'Supports NBS import/export, MIDI import, and piano-roll editing', '版本:': 'Version:', '开发者:': 'Developer:', '反馈邮箱:': 'Feedback:',
        '演奏模式设置': 'Performance mode settings', '节拍器:': 'Metronome:', '启用': 'Enable', '延音录制': 'Sustain recording', '外部 MIDI 设备输入': 'External MIDI input', '未连接': 'Not connected',
        '开始演奏': 'Start performance', '文件:': 'File:', '类型:': 'Type:', '时长:': 'Duration:', '轨道:': 'Tracks:', '基本设置': 'Basic', '通道映射': 'Channel mapping',
        '打击乐': 'Percussion', '通道': 'Channel', '音色': 'Timbre', 'NBS 乐器': 'NBS instrument', '偏移前音域': 'Range before shift', '偏移后音域': 'Range after shift',
        '八度': 'Octave', '音调': 'Pitch', '试听': 'Preview', '名称': 'Name', '事件': 'Events', '预览': 'Preview', '旋律': 'Melody', '乐器': 'Instrument',
        'MIDI 音符': 'MIDI note', 'NBS 音高': 'NBS pitch', '音色槽 1': 'Timbre slot 1', '音色槽 2': 'Timbre slot 2', '音色槽 3': 'Timbre slot 3',
        '移除无音符轨道': 'Remove empty tracks', '自动命名轨道': 'Auto-name tracks', '命名依据:': 'Naming based on:', '通道号': 'Channel number', '音色名': 'Patch name',
        '导入速度变化事件': 'Import tempo changes', '音域处理:': 'Range processing:', '不启用': 'Disabled', '单独音符归一法': 'Per-note normalization',
        '整体八度偏移法': 'Whole-track octave shift', '整体音调偏移法': 'Whole-track chromatic shift', '优先大调': 'Prefer major', '优先小调': 'Prefer minor',
        '启用智能音色替代': 'Enable smart timbre substitution', '启用溢出强制归位 (Fallback)': 'Force fold overflow (fallback)', '音色替代': 'Timbre substitution',
        '选择轨道': 'Select tracks', '记住以上设置': 'Remember these settings', '音色替代设置': 'Timbre substitution settings', '应用音轨': 'Apply to tracks',
        '音色替代配置': 'Substitution configuration', '高音替代': 'High-note substitute', '低音替代': 'Low-note substitute', '恢复默认': 'Restore defaults', '应用': 'Apply',
        '竖琴': 'Harp', '低音提琴': 'Double bass', '大鼓': 'Bass drum', '小鼓': 'Snare drum', '击打声': 'Click', '吉他': 'Guitar', '长笛': 'Flute', '钟琴': 'Bell',
        '风铃': 'Chime', '木琴': 'Xylophone', '铁木琴': 'Iron xylophone', '牛铃': 'Cow bell', '迪吉里杜管': 'Didgeridoo', '芯片音': 'Bit', '班卓琴': 'Banjo',
        '电钢琴': 'Pling', '铜号角': 'Copper Horn', '斑驳的铜号角': 'Exposed Copper Horn', '锈蚀的铜号角': 'Weathered Copper Horn', '氧化的铜号角': 'Oxidized Copper Horn', '无': 'None'
    });
    Object.assign(UI_TEXT['pt-BR'], {
        '平滑翻页 (播放头居中)': 'Rolagem suave (cabeçote central)', '音符播放高亮动画': 'Destaque de nota ao tocar', '录制时显示音符动画 (关闭可提升录制性能)': 'Mostrar animação de notas ao gravar',
        '音效优化 (混响/立体声)': 'Aprimoramento de áudio (reverberação/estéreo)', 'NBS 导出版本:': 'Versão de exportação NBS:', '含铜号角乐器时自动 V6': 'Usar V6 automaticamente com instrumentos de trompa de cobre',
        '关于 NoteBlockWeb': 'Sobre o NoteBlockWeb', '调节速度': 'Ajustar andamento', '基于 Web 的 Minecraft 音符盒编辑器': 'Editor web de blocos de nota do Minecraft',
        '支持 NBS 格式导入/导出, MIDI 导入, 钢琴卷帘编辑': 'Compatível com importação/exportação NBS, MIDI e editor piano roll', '版本:': 'Versão:', '开发者:': 'Desenvolvedor:', '反馈邮箱:': 'Contato:',
        '演奏模式设置': 'Configurações do modo de apresentação', '节拍器:': 'Metrônomo:', '启用': 'Ativar', '延音录制': 'Gravação de sustain', '外部 MIDI 设备输入': 'Entrada MIDI externa', '未连接': 'Desconectado',
        '开始演奏': 'Iniciar apresentação', '文件:': 'Arquivo:', '类型:': 'Tipo:', '时长:': 'Duração:', '轨道:': 'Faixas:', '通道映射': 'Mapeamento de canais',
        '打击乐': 'Percussão', '通道': 'Canal', '音色': 'Timbre', 'NBS 乐器': 'Instrumento NBS', '偏移前音域': 'Extensão antes do ajuste', '偏移后音域': 'Extensão após o ajuste',
        '八度': 'Oitava', '音调': 'Tom', '试听': 'Ouvir', '名称': 'Nome', '事件': 'Eventos', '预览': 'Prévia', '旋律': 'Melodia', '乐器': 'Instrumento',
        'MIDI 音符': 'Nota MIDI', 'NBS 音高': 'Tom NBS', '音色槽 1': 'Slot de timbre 1', '音色槽 2': 'Slot de timbre 2', '音色槽 3': 'Slot de timbre 3',
        '移除无音符轨道': 'Remover faixas sem notas', '自动命名轨道': 'Nomear faixas automaticamente', '命名依据:': 'Nomear por:', '通道号': 'Número do canal', '音色名': 'Nome do timbre',
        '导入速度变化事件': 'Importar mudanças de andamento', '音域处理:': 'Processamento de extensão:', '不启用': 'Desativado', '单独音符归一法': 'Normalização por nota',
        '整体八度偏移法': 'Deslocamento de oitava por faixa', '整体音调偏移法': 'Transposição cromática por faixa', '优先大调': 'Priorizar maior', '优先小调': 'Priorizar menor',
        '启用智能音色替代': 'Ativar substituição inteligente de timbre', '启用溢出强制归位 (Fallback)': 'Dobrar excedentes à força (reserva)', '音色替代': 'Substituição de timbre',
        '选择轨道': 'Selecionar faixas', '记住以上设置': 'Lembrar configurações', '音色替代设置': 'Configurações de substituição', '应用音轨': 'Aplicar às faixas',
        '音色替代配置': 'Configuração de substituição', '高音替代': 'Substituto agudo', '低音替代': 'Substituto grave', '恢复默认': 'Restaurar padrão', '应用': 'Aplicar',
        '竖琴': 'Harpa', '低音提琴': 'Contrabaixo', '大鼓': 'Bumbo', '小鼓': 'Caixa', '击打声': 'Clique', '吉他': 'Guitarra', '长笛': 'Flauta', '钟琴': 'Sino',
        '风铃': 'Carrilhão', '木琴': 'Xilofone', '铁木琴': 'Xilofone de ferro', '牛铃': 'Chocalho de vaca', '迪吉里杜管': 'Didgeridoo', '芯片音': 'Bit', '班卓琴': 'Banjo',
        '电钢琴': 'Pling', '铜号角': 'Trompa de cobre', '斑驳的铜号角': 'Trompa de cobre exposta', '锈蚀的铜号角': 'Trompa de cobre desgastada', '氧化的铜号角': 'Trompa de cobre oxidada', '无': 'Nenhum'
    });
    Object.assign(UI_TEXT['id-ID'], {
        '平滑翻页 (播放头居中)': 'Gulir halus (kepala putar di tengah)', '音符播放高亮动画': 'Sorotan not saat dimainkan', '录制时显示音符动画 (关闭可提升录制性能)': 'Tampilkan animasi not saat merekam',
        '音效优化 (混响/立体声)': 'Penyempurnaan audio (reverb/stereo)', 'NBS 导出版本:': 'Versi ekspor NBS:', '含铜号角乐器时自动 V6': 'Gunakan V6 otomatis untuk instrumen terompet tembaga',
        '关于 NoteBlockWeb': 'Tentang NoteBlockWeb', '调节速度': 'Atur tempo', '基于 Web 的 Minecraft 音符盒编辑器': 'Editor blok nada Minecraft berbasis web',
        '支持 NBS 格式导入/导出, MIDI 导入, 钢琴卷帘编辑': 'Mendukung impor/ekspor NBS, impor MIDI, dan editor piano roll', '版本:': 'Versi:', '开发者:': 'Pengembang:', '反馈邮箱:': 'Umpan balik:',
        '演奏模式设置': 'Pengaturan mode pertunjukan', '节拍器:': 'Metronom:', '启用': 'Aktifkan', '延音录制': 'Rekam sustain', '外部 MIDI 设备输入': 'Input MIDI eksternal', '未连接': 'Tidak terhubung',
        '开始演奏': 'Mulai pertunjukan', '文件:': 'Berkas:', '类型:': 'Jenis:', '时长:': 'Durasi:', '轨道:': 'Trek:', '通道映射': 'Pemetaan kanal',
        '打击乐': 'Perkusi', '通道': 'Kanal', '音色': 'Timbre', 'NBS 乐器': 'Instrumen NBS', '偏移前音域': 'Rentang sebelum pergeseran', '偏移后音域': 'Rentang setelah pergeseran',
        '八度': 'Oktaf', '音调': 'Nada', '试听': 'Pratinjau', '名称': 'Nama', '事件': 'Peristiwa', '预览': 'Pratinjau', '旋律': 'Melodi', '乐器': 'Instrumen',
        'MIDI 音符': 'Not MIDI', 'NBS 音高': 'Nada NBS', '音色槽 1': 'Slot timbre 1', '音色槽 2': 'Slot timbre 2', '音色槽 3': 'Slot timbre 3',
        '移除无音符轨道': 'Hapus trek tanpa not', '自动命名轨道': 'Namai trek otomatis', '命名依据:': 'Dasar penamaan:', '通道号': 'Nomor kanal', '音色名': 'Nama timbre',
        '导入速度变化事件': 'Impor perubahan tempo', '音域处理:': 'Pemrosesan rentang:', '不启用': 'Nonaktif', '单独音符归一法': 'Normalisasi per not',
        '整体八度偏移法': 'Geser oktaf per trek', '整体音调偏移法': 'Geser kromatik per trek', '优先大调': 'Prioritaskan mayor', '优先小调': 'Prioritaskan minor',
        '启用智能音色替代': 'Aktifkan penggantian timbre cerdas', '启用溢出强制归位 (Fallback)': 'Paksa lipat nada berlebih (cadangan)', '音色替代': 'Penggantian timbre',
        '选择轨道': 'Pilih trek', '记住以上设置': 'Ingat pengaturan', '音色替代设置': 'Pengaturan penggantian timbre', '应用音轨': 'Terapkan ke trek',
        '音色替代配置': 'Konfigurasi penggantian', '高音替代': 'Pengganti nada tinggi', '低音替代': 'Pengganti nada rendah', '恢复默认': 'Pulihkan bawaan', '应用': 'Terapkan',
        '竖琴': 'Harpa', '低音提琴': 'Kontrabas', '大鼓': 'Drum bas', '小鼓': 'Snare', '击打声': 'Klik', '吉他': 'Gitar', '长笛': 'Seruling', '钟琴': 'Lonceng',
        '风铃': 'Chime', '木琴': 'Xilofon', '铁木琴': 'Xilofon besi', '牛铃': 'Lonceng sapi', '迪吉里杜管': 'Didgeridoo', '芯片音': 'Bit', '班卓琴': 'Banjo',
        '电钢琴': 'Pling', '铜号角': 'Terompet Tembaga', '斑驳的铜号角': 'Terompet Tembaga Terpapar', '锈蚀的铜号角': 'Terompet Tembaga Lapuk', '氧化的铜号角': 'Terompet Tembaga Teroksidasi', '无': 'Tidak ada'
    });

    // Shared commands, menus and popovers. These strings are generated at runtime
    // by the editor, so they cannot rely on static HTML translation alone.
    Object.assign(UI_TEXT['en-US'], {
        '提示': 'Notice', '确认': 'Confirm', '输入': 'Input', '确定': 'OK', '导出': 'Export', '文件名:': 'File name:', '请输入文件名': 'Enter a file name',
        '作者和介绍 (可选)': 'Author and description (optional)', '作者:': 'Author:', '作者名 (可选)': 'Author name (optional)', '介绍:': 'Description:', '歌曲介绍 (可选)': 'Song description (optional)',
        '点击重命名音轨': 'Rename track', '选择这一轨的全部音符': 'Select all notes in this track', '拖动调整音轨顺序': 'Drag to reorder tracks', '删除这一条音轨': 'Delete this track',
        '设置音量': 'Set volume', '静音这一条音轨': 'Mute this track', '只试听这一条音轨': 'Solo this track', '添加新音轨': 'Add track', '更多音轨操作': 'More track actions',
        '展开音轨信息栏': 'Expand track panel', '折叠音轨信息栏': 'Collapse track panel', '展开/折叠钢琴键盘': 'Show/hide piano keyboard', '设置小键盘弹奏音域': 'Set numpad playing range',
        '弹奏音域设置': 'Playing range settings', '字母键盘': 'Letter keyboard', '小键盘': 'Numeric keypad', '八度偏移': 'Octave shift', '半音偏移': 'Semitone shift', '重置': 'Reset',
        '打开文件': 'Open file', '新建文件': 'New file', '历史文件': 'History', '暂无历史文件': 'No saved files', '更多...': 'More...',
        '修改音量': 'Change volume', '输入音量 (0-100):': 'Enter volume (0-100):', '删除轨道': 'Delete track', '上移轨道': 'Move track up', '下移轨道': 'Move track down',
        '请在画布中点击选择要录制的音轨': 'Click a track row on the canvas to select it for recording', '请先在画布中点击选择要录制的音轨！': 'Select a track row on the canvas before recording.',
        '浏览器不支持 MIDI 设备': 'This browser does not support MIDI devices', 'MIDI 设备访问被拒绝': 'MIDI device access was denied', '未检测到 MIDI 设备': 'No MIDI device detected',
        '停止录制': 'Stop recording', '开始演奏录制': 'Start performance recording', '播放/暂停试听': 'Play/pause preview', '平滑翻页: 开启': 'Smooth follow: on', '平滑翻页: 关闭': 'Smooth follow: off',
        '缩放精度': 'Scale precision', '将所有音符的时间位置 (tick) 按比例缩放：': 'Scale every note time position (tick) by a factor:', '选择缩放倍数：': 'Choose a scale factor:',
        '音符吸附': 'Note snap', '将音符吸附到最近的网格线上。': 'Snap notes to the nearest grid line.', '选择范围：': 'Choose scope:', '全部音符': 'All notes', '当前轨道': 'Current track', '选中音符': 'Selected notes', '选择拍子：': 'Choose beat:',
        '音调偏移': 'Pitch shift', '偏移方式:': 'Shift mode:', '按音调': 'Semitones', '按八度': 'Octaves', '偏移量:': 'Shift amount:', '正=向上, 负=向下': 'Positive = up, negative = down',
        '延音填充': 'Sustain fill', '清除延音': 'Clear sustain', '上下起伏': 'Arpeggio motion', '转8度内': 'Fold to 2 octaves',
        '当前没有音符，无法缩放': 'There are no notes to scale', '当前没有音符': 'There are no notes', '没有选中任何音符': 'No notes are selected', '没有需要吸附的音符': 'There are no notes to snap',
        '没有空轨可清除': 'There are no empty tracks to remove', '清除空轨': 'Remove empty tracks', '至少保留一条音轨。': 'Keep at least one track.',
        '未检测到旋律通道': 'No melodic channels detected', '未检测到打击乐音符': 'No percussion notes detected', '暂无 MIDI 音轨数据': 'No MIDI track data available',
        '加载': 'Load', '保存成功': 'Saved successfully', '警告': 'Warning', '保存': 'Save', '加载失败': 'Load failed', '导出失败': 'Export failed', '没有可导出的歌曲': 'There is no song to export',
        '演奏模式': 'Performance mode', '关闭': 'Close', '知道了': 'Got it', '应用': 'Apply'
        , '音轨': 'Track', '名称': 'Name', '乐器': 'Instrument', '音量': 'Volume', '声像': 'Pan', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out',
        '打开钢琴卷帘': 'Open piano roll', '复制片段': 'Duplicate clip', '删除片段': 'Delete clip', '回到开头': 'Back to start', '菜单': 'Menu',
        '音符超出范围': 'Notes out of range', '部分音符超出了 Minecraft 标准音域 (F#3 ~ F#5):': 'Some notes are outside the Minecraft standard range (F#3-F#5):',
        '超出范围的音符在 Minecraft 中播放可能音色异常。你可以在"功能"菜单中使用"转8度内"修正。': 'Notes outside the range may use an incorrect timbre in Minecraft. Use "Fold to 2 octaves" in Tools to correct them.',
        '按住琴键会按持续时长补齐音符': 'Holding a piano key fills notes for its duration', '提示: 在画布中点击音轨行可选择/取消选择，可多选': 'Tip: click track rows on the canvas to select or deselect them; multiple tracks are supported.',
        '勾选后可连接外部 MIDI 键盘/架子鼓进行输入': 'Enable this to use an external MIDI keyboard or drum pad.', '不保留': 'Do not keep', '全部保留': 'Keep all', '按轨道选择': 'Choose tracks',
        '选择需要应用音色替代的 MIDI 音轨。未选中的音轨中超出音域的音符将保留原状。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'Choose MIDI tracks for timbre substitution. Out-of-range notes in unselected tracks stay unchanged. The mini roll previews pitch (Y) over time (X); click it to preview from that point.',
        '为每个 NBS 音色配置高音/低音替代乐器。超出 MC 音域 (F#3~F#5) 的音符将切换到替代音色并使用等音高换算，保证实际播放音高不变。点击音色槽打开菜单试听当前音色，选择新音色后也会立即试听。': 'Configure high and low substitutes for each NBS timbre. Notes outside F#3-F#5 use an equivalent-pitch substitute so their actual pitch remains unchanged. Click a slot to preview and choose an instrument.',
        '目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。': 'Targets the Minecraft note-block range F#3-F#5. It shifts first, then tries timbre substitution, then can force-fold remaining notes.',
        '偏移转换': 'Pitch conversion', '同分偏移': 'Tie-break shift', '启用音色替代': 'Enable timbre substitution', '强制转音域内': 'Force fold into range', '全部': 'All', '不启用': 'Disabled', '单独音符归一法': 'Per-note normalization', '整体八度偏移法': 'Whole-track octave shift', '整体音调偏移法': 'Whole-track chromatic shift'
    });
    Object.assign(UI_TEXT['pt-BR'], {
        '提示': 'Aviso', '确认': 'Confirmar', '输入': 'Entrada', '确定': 'OK', '导出': 'Exportar', '文件名:': 'Nome do arquivo:', '请输入文件名': 'Digite um nome de arquivo',
        '作者和介绍 (可选)': 'Autor e descrição (opcional)', '作者:': 'Autor:', '作者名 (可选)': 'Nome do autor (opcional)', '介绍:': 'Descrição:', '歌曲介绍 (可选)': 'Descrição da música (opcional)',
        '点击重命名音轨': 'Renomear faixa', '选择这一轨的全部音符': 'Selecionar todas as notas desta faixa', '拖动调整音轨顺序': 'Arraste para reordenar faixas', '删除这一条音轨': 'Excluir esta faixa',
        '设置音量': 'Definir volume', '静音这一条音轨': 'Silenciar esta faixa', '只试听这一条音轨': 'Solar esta faixa', '添加新音轨': 'Adicionar faixa', '更多音轨操作': 'Mais ações de faixa',
        '展开音轨信息栏': 'Expandir painel de faixas', '折叠音轨信息栏': 'Recolher painel de faixas', '展开/折叠钢琴键盘': 'Mostrar/ocultar teclado de piano', '设置小键盘弹奏音域': 'Definir extensão do teclado numérico',
        '弹奏音域设置': 'Configurações de extensão para tocar', '字母键盘': 'Teclado de letras', '小键盘': 'Teclado numérico', '八度偏移': 'Deslocamento de oitava', '半音偏移': 'Deslocamento de semitom', '重置': 'Redefinir',
        '打开文件': 'Abrir arquivo', '新建文件': 'Novo arquivo', '历史文件': 'Histórico', '暂无历史文件': 'Nenhum arquivo salvo', '更多...': 'Mais...',
        '修改音量': 'Alterar volume', '输入音量 (0-100):': 'Digite o volume (0-100):', '删除轨道': 'Excluir faixa', '上移轨道': 'Mover faixa para cima', '下移轨道': 'Mover faixa para baixo',
        '请在画布中点击选择要录制的音轨': 'Clique em uma faixa no painel para selecioná-la para gravação', '请先在画布中点击选择要录制的音轨！': 'Selecione uma faixa no painel antes de gravar.',
        '浏览器不支持 MIDI 设备': 'Este navegador não oferece suporte a dispositivos MIDI', 'MIDI 设备访问被拒绝': 'O acesso ao dispositivo MIDI foi negado', '未检测到 MIDI 设备': 'Nenhum dispositivo MIDI detectado',
        '停止录制': 'Parar gravação', '开始演奏录制': 'Iniciar gravação de apresentação', '播放/暂停试听': 'Reproduzir/pausar prévia', '平滑翻页: 开启': 'Rolagem suave: ativada', '平滑翻页: 关闭': 'Rolagem suave: desativada',
        '缩放精度': 'Escalar precisão', '将所有音符的时间位置 (tick) 按比例缩放：': 'Escalone a posição temporal (tick) de todas as notas:', '选择缩放倍数：': 'Escolha um fator de escala:',
        '音符吸附': 'Quantizar notas', '将音符吸附到最近的网格线上。': 'Quantize notas para a linha de grade mais próxima.', '选择范围：': 'Escolha o escopo:', '全部音符': 'Todas as notas', '当前轨道': 'Faixa atual', '选中音符': 'Notas selecionadas', '选择拍子：': 'Escolha a divisão:',
        '音调偏移': 'Transpor tom', '偏移方式:': 'Modo de transposição:', '按音调': 'Semitons', '按八度': 'Oitavas', '偏移量:': 'Valor da transposição:', '正=向上, 负=向下': 'Positivo = sobe, negativo = desce',
        '延音填充': 'Preencher sustain', '清除延音': 'Limpar sustain', '上下起伏': 'Movimento de arpejo', '转8度内': 'Dobrar para 2 oitavas',
        '当前没有音符，无法缩放': 'Não há notas para escalar', '当前没有音符': 'Não há notas', '没有选中任何音符': 'Nenhuma nota selecionada', '没有需要吸附的音符': 'Não há notas para quantizar',
        '没有空轨可清除': 'Não há faixas vazias para remover', '清除空轨': 'Remover faixas vazias', '至少保留一条音轨。': 'Mantenha pelo menos uma faixa.',
        '未检测到旋律通道': 'Nenhum canal melódico detectado', '未检测到打击乐音符': 'Nenhuma nota de percussão detectada', '暂无 MIDI 音轨数据': 'Não há dados de faixa MIDI',
        '加载': 'Carregar', '保存成功': 'Salvo com sucesso', '警告': 'Aviso', '保存': 'Salvar', '加载失败': 'Falha ao carregar', '导出失败': 'Falha ao exportar', '没有可导出的歌曲': 'Não há música para exportar',
        '演奏模式': 'Modo de apresentação', '关闭': 'Fechar', '知道了': 'Entendi', '应用': 'Aplicar'
        , '音轨': 'Faixa', '名称': 'Nome', '乐器': 'Instrumento', '音量': 'Volume', '声像': 'Panorama', '混响': 'Reverberação', '淡入': 'Fade in', '淡出': 'Fade out',
        '打开钢琴卷帘': 'Abrir piano roll', '复制片段': 'Duplicar clipe', '删除片段': 'Excluir clipe', '回到开头': 'Voltar ao início', '菜单': 'Menu',
        '音符超出范围': 'Notas fora da extensão', '部分音符超出了 Minecraft 标准音域 (F#3 ~ F#5):': 'Algumas notas estão fora da extensão padrão do Minecraft (F#3-F#5):',
        '超出范围的音符在 Minecraft 中播放可能音色异常。你可以在"功能"菜单中使用"转8度内"修正。': 'Notas fora da extensão podem soar com timbre incorreto no Minecraft. Use "Dobrar para 2 oitavas" em Ferramentas para corrigir.',
        '按住琴键会按持续时长补齐音符': 'Segurar uma tecla preenche notas pela duração', '提示: 在画布中点击音轨行可选择/取消选择，可多选': 'Dica: clique nas faixas no painel para selecionar ou desmarcar; é possível selecionar várias.',
        '勾选后可连接外部 MIDI 键盘/架子鼓进行输入': 'Ative para usar um teclado MIDI ou pad de bateria externo.', '不保留': 'Não manter', '全部保留': 'Manter tudo', '按轨道选择': 'Escolher faixas',
        '选择需要应用音色替代的 MIDI 音轨。未选中的音轨中超出音域的音符将保留原状。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'Escolha faixas MIDI para substituir o timbre. Notas fora da extensão em faixas não selecionadas permanecem inalteradas. Clique no mini piano roll para ouvir a partir daquele ponto.',
        '为每个 NBS 音色配置高音/低音替代乐器。超出 MC 音域 (F#3~F#5) 的音符将切换到替代音色并使用等音高换算，保证实际播放音高不变。点击音色槽打开菜单试听当前音色，选择新音色后也会立即试听。': 'Configure substitutos agudos e graves para cada timbre NBS. Notas fora de F#3-F#5 usam um substituto de mesmo tom, preservando a altura real.',
        '目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。': 'Tem como alvo a extensão F#3-F#5 dos blocos de nota do Minecraft. Primeiro desloca, depois tenta substituir o timbre e por fim pode dobrar o restante.',
        '偏移转换': 'Conversão de tom', '同分偏移': 'Desempate de transposição', '启用音色替代': 'Ativar substituição de timbre', '强制转音域内': 'Forçar dentro da extensão', '全部': 'Tudo', '不启用': 'Desativado', '单独音符归一法': 'Normalização por nota', '整体八度偏移法': 'Deslocamento de oitava por faixa', '整体音调偏移法': 'Transposição cromática por faixa'
    });
    Object.assign(UI_TEXT['id-ID'], {
        '提示': 'Pemberitahuan', '确认': 'Konfirmasi', '输入': 'Masukan', '确定': 'OK', '导出': 'Ekspor', '文件名:': 'Nama berkas:', '请输入文件名': 'Masukkan nama berkas',
        '作者和介绍 (可选)': 'Penulis dan deskripsi (opsional)', '作者:': 'Penulis:', '作者名 (可选)': 'Nama penulis (opsional)', '介绍:': 'Deskripsi:', '歌曲介绍 (可选)': 'Deskripsi lagu (opsional)',
        '点击重命名音轨': 'Ubah nama trek', '选择这一轨的全部音符': 'Pilih semua not di trek ini', '拖动调整音轨顺序': 'Seret untuk mengurutkan trek', '删除这一条音轨': 'Hapus trek ini',
        '设置音量': 'Atur volume', '静音这一条音轨': 'Bisukan trek ini', '只试听这一条音轨': 'Solo trek ini', '添加新音轨': 'Tambah trek', '更多音轨操作': 'Tindakan trek lainnya',
        '展开音轨信息栏': 'Buka panel trek', '折叠音轨信息栏': 'Ciutkan panel trek', '展开/折叠钢琴键盘': 'Tampilkan/sembunyikan keyboard piano', '设置小键盘弹奏音域': 'Atur jangkauan keypad numerik',
        '弹奏音域设置': 'Pengaturan jangkauan bermain', '字母键盘': 'Keyboard huruf', '小键盘': 'Keypad numerik', '八度偏移': 'Geser oktaf', '半音偏移': 'Geser semiton', '重置': 'Atur ulang',
        '打开文件': 'Buka berkas', '新建文件': 'Berkas baru', '历史文件': 'Riwayat', '暂无历史文件': 'Belum ada berkas tersimpan', '更多...': 'Lainnya...',
        '修改音量': 'Ubah volume', '输入音量 (0-100):': 'Masukkan volume (0-100):', '删除轨道': 'Hapus trek', '上移轨道': 'Naikkan trek', '下移轨道': 'Turunkan trek',
        '请在画布中点击选择要录制的音轨': 'Klik baris trek di kanvas untuk memilihnya sebagai tujuan rekam', '请先在画布中点击选择要录制的音轨！': 'Pilih baris trek di kanvas sebelum merekam.',
        '浏览器不支持 MIDI 设备': 'Browser ini tidak mendukung perangkat MIDI', 'MIDI 设备访问被拒绝': 'Akses perangkat MIDI ditolak', '未检测到 MIDI 设备': 'Tidak ada perangkat MIDI terdeteksi',
        '停止录制': 'Hentikan rekam', '开始演奏录制': 'Mulai rekam pertunjukan', '播放/暂停试听': 'Putar/jeda pratinjau', '平滑翻页: 开启': 'Gulir halus: aktif', '平滑翻页: 关闭': 'Gulir halus: nonaktif',
        '缩放精度': 'Skalakan presisi', '将所有音符的时间位置 (tick) 按比例缩放：': 'Skalakan posisi waktu (tick) semua not:', '选择缩放倍数：': 'Pilih faktor skala:',
        '音符吸附': 'Kuantisasi not', '将音符吸附到最近的网格线上。': 'Kuantisasi not ke garis kisi terdekat.', '选择范围：': 'Pilih cakupan:', '全部音符': 'Semua not', '当前轨道': 'Trek saat ini', '选中音符': 'Not terpilih', '选择拍子：': 'Pilih ketukan:',
        '音调偏移': 'Geser nada', '偏移方式:': 'Mode geser:', '按音调': 'Semiton', '按八度': 'Oktaf', '偏移量:': 'Nilai geser:', '正=向上, 负=向下': 'Positif = naik, negatif = turun',
        '延音填充': 'Isi sustain', '清除延音': 'Hapus sustain', '上下起伏': 'Gerak arpeggio', '转8度内': 'Lipat ke 2 oktaf',
        '当前没有音符，无法缩放': 'Tidak ada not untuk diskalakan', '当前没有音符': 'Tidak ada not', '没有选中任何音符': 'Tidak ada not dipilih', '没有需要吸附的音符': 'Tidak ada not untuk dikuantisasi',
        '没有空轨可清除': 'Tidak ada trek kosong untuk dihapus', '清除空轨': 'Hapus trek kosong', '至少保留一条音轨。': 'Sisakan setidaknya satu trek.',
        '未检测到旋律通道': 'Tidak ada kanal melodi terdeteksi', '未检测到打击乐音符': 'Tidak ada not perkusi terdeteksi', '暂无 MIDI 音轨数据': 'Tidak ada data trek MIDI',
        '加载': 'Muat', '保存成功': 'Berhasil disimpan', '警告': 'Peringatan', '保存': 'Simpan', '加载失败': 'Gagal memuat', '导出失败': 'Gagal mengekspor', '没有可导出的歌曲': 'Tidak ada lagu untuk diekspor',
        '演奏模式': 'Mode pertunjukan', '关闭': 'Tutup', '知道了': 'Mengerti', '应用': 'Terapkan'
        , '音轨': 'Trek', '名称': 'Nama', '乐器': 'Instrumen', '音量': 'Volume', '声像': 'Panorama', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out',
        '打开钢琴卷帘': 'Buka piano roll', '复制片段': 'Duplikat klip', '删除片段': 'Hapus klip', '回到开头': 'Kembali ke awal', '菜单': 'Menu',
        '音符超出范围': 'Not di luar rentang', '部分音符超出了 Minecraft 标准音域 (F#3 ~ F#5):': 'Beberapa not berada di luar rentang standar Minecraft (F#3-F#5):',
        '超出范围的音符在 Minecraft 中播放可能音色异常。你可以在"功能"菜单中使用"转8度内"修正。': 'Not di luar rentang mungkin memakai timbre yang salah di Minecraft. Gunakan "Lipat ke 2 oktaf" di Alat untuk memperbaikinya.',
        '按住琴键会按持续时长补齐音符': 'Menahan tuts akan mengisi not sesuai durasinya', '提示: 在画布中点击音轨行可选择/取消选择，可多选': 'Tip: klik baris trek di kanvas untuk memilih atau membatalkan pilihan; beberapa trek dapat dipilih.',
        '勾选后可连接外部 MIDI 键盘/架子鼓进行输入': 'Aktifkan untuk memakai keyboard MIDI atau drum pad eksternal.', '不保留': 'Jangan pertahankan', '全部保留': 'Pertahankan semua', '按轨道选择': 'Pilih trek',
        '选择需要应用音色替代的 MIDI 音轨。未选中的音轨中超出音域的音符将保留原状。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'Pilih trek MIDI untuk penggantian timbre. Not di luar rentang pada trek yang tidak dipilih tidak diubah. Klik mini roll untuk pratinjau dari titik itu.',
        '为每个 NBS 音色配置高音/低音替代乐器。超出 MC 音域 (F#3~F#5) 的音符将切换到替代音色并使用等音高换算，保证实际播放音高不变。点击音色槽打开菜单试听当前音色，选择新音色后也会立即试听。': 'Atur pengganti nada tinggi dan rendah untuk setiap timbre NBS. Not di luar F#3-F#5 memakai pengganti dengan tinggi yang setara agar nada sebenarnya tidak berubah.',
        '目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。': 'Menargetkan rentang blok nada Minecraft F#3-F#5. Nada digeser terlebih dahulu, lalu dicoba penggantian timbre, dan sisanya dapat dipaksa dilipat.',
        '偏移转换': 'Konversi nada', '同分偏移': 'Pergeseran pemecah seri', '启用音色替代': 'Aktifkan penggantian timbre', '强制转音域内': 'Paksa lipat ke rentang', '全部': 'Semua', '不启用': 'Nonaktif', '单独音符归一法': 'Normalisasi per not', '整体八度偏移法': 'Geser oktaf per trek', '整体音调偏移法': 'Geser kromatik per trek'
    });

    // Static controls that are shared by the toolbar, floating menus, MIDI
    // dialog. Keeping these additions together prevents the same
    // visible label from being translated in one dialog but missed in another.
    Object.assign(UI_TEXT['en-US'], {
        '速度:': 'Tempo:', '速度 (Tick/秒):': 'Tempo (ticks/sec):', '音符:': 'Notes:', '音符': 'Notes', '音轨设置': 'Track settings',
        '音域': 'Range', '处理中': 'Processing', '计算中…': 'Calculating…', 'MC 音域 F#3~F#5 (MIDI 54~78)': 'Minecraft range F#3-F#5 (MIDI 54-78)',
        'MIDI 试听': 'MIDI preview', 'NBS 试听': 'NBS preview', 'NBS 音色': 'NBS timbre', 'QQ交流群:': 'QQ community:',
        '试听 MIDI 原音': 'Preview original MIDI', '试听 NBS 拟合音色': 'Preview fitted NBS timbre', '试听 NBS 组合音': 'Preview NBS timbre mix',
        '点击选择高音替代音色': 'Choose high-note substitute', '点击选择低音替代音色': 'Choose low-note substitute',
        '回到开头': 'Back to start', '恢复自动': 'Restore automatic', '忽略': 'Ignore', '自动(用拟合音色)': 'Automatic (use fitted timbre)',
        '范围:': 'Range:', '范围: -': 'Range: -', 'MIDI 信息': 'MIDI information', '轨道': 'Track', '语言:': 'Language:',
        '音域 F#3~F#5 (MIDI 54~78)': 'Range F#3-F#5 (MIDI 54-78)', '个音符': 'note(s)', '加载中…': 'Loading…', '音符: 0': 'Notes: 0',
        '处理中…': 'Processing…', '速度': 'Tempo', '加载': 'Load', '操作': 'Actions', '时间': 'Time', '大小': 'Size',
        '打开钢琴卷帘': 'Open piano roll', '复制片段': 'Duplicate clip', '删除片段': 'Delete clip', '重命名': 'Rename',
        '添加音轨': 'Add track', '新音轨名称:': 'New track name:', 'Clip 名称:': 'Clip name:', '重命名 Clip': 'Rename clip',
        '删除 Clip': 'Delete clip', '删除音轨': 'Delete track', '乐器': 'Instrument', '声像': 'Pan', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out'
        , '播放/暂停': 'Play/Pause', '停止': 'Stop', 'Minecraft 标准音域 MIDI 54~78 (NBS key 33~57, F#3~F#5)': 'Minecraft standard range: MIDI 54-78 (NBS keys 33-57, F#3-F#5)',
        '优先使用音色替代解决超限音符，替代无法完全覆盖时才动用整体偏移。仅在模式2/3可用，模式0/1下灰显无效': 'Prefer timbre substitution for out-of-range notes. Use whole-track shifting only when substitution cannot cover them all. Available only in modes 2 and 3.',
        '勾选后音色替代链用尽仍有超限时，强制对 MIDI 数值进行 ±12 取模归位。仅在模式2/3可用': 'When enabled, remaining out-of-range notes are folded by +/-12 semitones after all timbre substitutes are exhausted. Available only in modes 2 and 3.',
        '配置超出音域音符的音色替代方案': 'Configure timbre substitutes for out-of-range notes'
    });
    Object.assign(UI_TEXT['pt-BR'], {
        '速度:': 'Andamento:', '速度 (Tick/秒):': 'Andamento (ticks/s):', '音符:': 'Notas:', '音符': 'Notas', '音轨设置': 'Configurações da faixa',
        '音域': 'Extensão', '处理中': 'Processando', '计算中…': 'Calculando…', 'MC 音域 F#3~F#5 (MIDI 54~78)': 'Extensão do Minecraft F#3-F#5 (MIDI 54-78)',
        'MIDI 试听': 'Prévia MIDI', 'NBS 试听': 'Prévia NBS', 'NBS 音色': 'Timbre NBS', 'QQ交流群:': 'Comunidade QQ:',
        '试听 MIDI 原音': 'Ouvir MIDI original', '试听 NBS 拟合音色': 'Ouvir timbre NBS ajustado', '试听 NBS 组合音': 'Ouvir combinação NBS',
        '点击选择高音替代音色': 'Escolher substituto agudo', '点击选择低音替代音色': 'Escolher substituto grave',
        '回到开头': 'Voltar ao início', '恢复自动': 'Restaurar automático', '忽略': 'Ignorar', '自动(用拟合音色)': 'Automático (usar timbre ajustado)',
        '范围:': 'Extensão:', '范围: -': 'Extensão: -', 'MIDI 信息': 'Informações MIDI', '轨道': 'Faixa', '语言:': 'Idioma:',
        '音域 F#3~F#5 (MIDI 54~78)': 'Extensão F#3-F#5 (MIDI 54-78)', '个音符': 'nota(s)', '加载中…': 'Carregando…', '音符: 0': 'Notas: 0',
        '处理中…': 'Processando…', '速度': 'Andamento', '加载': 'Carregar', '操作': 'Ações', '时间': 'Tempo', '大小': 'Tamanho',
        '打开钢琴卷帘': 'Abrir piano roll', '复制片段': 'Duplicar clipe', '删除片段': 'Excluir clipe', '重命名': 'Renomear',
        '添加音轨': 'Adicionar faixa', '新音轨名称:': 'Nome da nova faixa:', 'Clip 名称:': 'Nome do clipe:', '重命名 Clip': 'Renomear clipe',
        '删除 Clip': 'Excluir clipe', '删除音轨': 'Excluir faixa', '乐器': 'Instrumento', '声像': 'Panorama', '混响': 'Reverberação', '淡入': 'Fade in', '淡出': 'Fade out'
        , '播放/暂停': 'Reproduzir/Pausar', '停止': 'Parar', 'Minecraft 标准音域 MIDI 54~78 (NBS key 33~57, F#3~F#5)': 'Extensão padrão do Minecraft: MIDI 54-78 (chaves NBS 33-57, F#3-F#5)',
        '优先使用音色替代解决超限音符，替代无法完全覆盖时才动用整体偏移。仅在模式2/3可用，模式0/1下灰显无效': 'Priorize a substituição de timbre para notas fora da extensão. Use o deslocamento de faixa inteira somente quando a substituição não cobrir tudo. Disponível apenas nos modos 2 e 3.',
        '勾选后音色替代链用尽仍有超限时，强制对 MIDI 数值进行 ±12 取模归位。仅在模式2/3可用': 'Quando ativado, as notas restantes fora da extensão são dobradas em +/-12 semitons após esgotar todos os substitutos. Disponível apenas nos modos 2 e 3.',
        '配置超出音域音符的音色替代方案': 'Configurar substitutos de timbre para notas fora da extensão'
    });
    Object.assign(UI_TEXT['id-ID'], {
        '速度:': 'Tempo:', '速度 (Tick/秒):': 'Tempo (tick/detik):', '音符:': 'Not:', '音符': 'Not', '音轨设置': 'Pengaturan trek',
        '音域': 'Rentang', '处理中': 'Memproses', '计算中…': 'Menghitung…', 'MC 音域 F#3~F#5 (MIDI 54~78)': 'Rentang Minecraft F#3-F#5 (MIDI 54-78)',
        'MIDI 试听': 'Pratinjau MIDI', 'NBS 试听': 'Pratinjau NBS', 'NBS 音色': 'Timbre NBS', 'QQ交流群:': 'Komunitas QQ:',
        '试听 MIDI 原音': 'Pratinjau MIDI asli', '试听 NBS 拟合音色': 'Pratinjau timbre NBS hasil pencocokan', '试听 NBS 组合音': 'Pratinjau gabungan NBS',
        '点击选择高音替代音色': 'Pilih pengganti nada tinggi', '点击选择低音替代音色': 'Pilih pengganti nada rendah',
        '回到开头': 'Kembali ke awal', '恢复自动': 'Pulihkan otomatis', '忽略': 'Abaikan', '自动(用拟合音色)': 'Otomatis (gunakan timbre hasil pencocokan)',
        '范围:': 'Rentang:', '范围: -': 'Rentang: -', 'MIDI 信息': 'Informasi MIDI', '轨道': 'Trek', '语言:': 'Bahasa:',
        '音域 F#3~F#5 (MIDI 54~78)': 'Rentang F#3-F#5 (MIDI 54-78)', '个音符': 'not', '加载中…': 'Memuat…', '音符: 0': 'Not: 0',
        '处理中…': 'Memproses…', '速度': 'Tempo', '加载': 'Muat', '操作': 'Tindakan', '时间': 'Waktu', '大小': 'Ukuran',
        '打开钢琴卷帘': 'Buka piano roll', '复制片段': 'Duplikat klip', '删除片段': 'Hapus klip', '重命名': 'Ubah nama',
        '添加音轨': 'Tambah trek', '新音轨名称:': 'Nama trek baru:', 'Clip 名称:': 'Nama klip:', '重命名 Clip': 'Ubah nama klip',
        '删除 Clip': 'Hapus klip', '删除音轨': 'Hapus trek', '乐器': 'Instrumen', '声像': 'Panorama', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out'
        , '播放/暂停': 'Putar/Jeda', '停止': 'Berhenti', 'Minecraft 标准音域 MIDI 54~78 (NBS key 33~57, F#3~F#5)': 'Rentang standar Minecraft: MIDI 54-78 (kunci NBS 33-57, F#3-F#5)',
        '优先使用音色替代解决超限音符，替代无法完全覆盖时才动用整体偏移。仅在模式2/3可用，模式0/1下灰显无效': 'Utamakan penggantian timbre untuk not di luar rentang. Gunakan pergeseran seluruh trek hanya jika penggantian tidak dapat mencakup semuanya. Hanya tersedia di mode 2 dan 3.',
        '勾选后音色替代链用尽仍有超限时，强制对 MIDI 数值进行 ±12 取模归位。仅在模式2/3可用': 'Jika diaktifkan, not di luar rentang yang tersisa akan dilipat sebesar +/-12 semiton setelah semua pengganti habis. Hanya tersedia di mode 2 dan 3.',
        '配置超出音域音符的音色替代方案': 'Atur pengganti timbre untuk not di luar rentang'
    });

    // New locales inherit the complete English runtime vocabulary first. This keeps
    // controls added by future editor updates readable until their local wording is
    // added, while the main editor and all instrument labels are localized here.
    var INSTRUMENT_KEYS = ['竖琴', '低音提琴', '大鼓', '小鼓', '击打声', '吉他', '长笛', '钟琴', '风铃', '木琴', '铁木琴', '牛铃', '迪吉里杜管', '芯片音', '班卓琴', '电钢琴', '铜号角', '斑驳的铜号角', '锈蚀的铜号角', '氧化的铜号角'];
    function addLocale(locale, labels, vocabulary, instruments) {
        TEXT[locale] = labels;
        UI_TEXT[locale] = Object.assign({}, UI_TEXT['en-US'], vocabulary);
        for (var i = 0; i < INSTRUMENT_KEYS.length; i++) UI_TEXT[locale][INSTRUMENT_KEYS[i]] = instruments[i];
    }

    addLocale('es-ES', {
        page_title: 'NoteBlockWeb - Editor de bloques de notas de Minecraft', language: 'Idioma', settings: 'Configuración', about: 'Acerca de', functions: 'Herramientas',
        privacy_title: 'Aviso de privacidad', privacy_message: 'Este servicio procesa el archivo MIDI o NBS que selecciones solo durante la sesión actual. El contenido no se guarda de forma permanente y no se recopilan datos personales.',
        agree: 'Aceptar', feedback: 'Comentarios', open_source: 'Bibliotecas de código abierto', update_notes: 'Novedades', close: 'Cerrar', file: 'Archivo', keyboard_piano: 'Teclado de piano', midi_import: 'Importar MIDI'
    }, {
        '文件': 'Archivo', '速度': 'Tempo', '撤销': 'Deshacer', '重做': 'Rehacer', '设置': 'Configuración', '关于': 'Acerca de', '功能': 'Herramientas', '更多': 'Más',
        '钢琴键盘': 'Teclado de piano', '使用键盘触发钢琴': 'Usar el teclado del ordenador como piano', '折叠音轨列表': 'Contraer lista de pistas',
        '默认工具 (D)': 'Herramienta predeterminada (D)', '选择工具 (S)': 'Herramienta de selección (S)', '橡皮擦 (E)': 'Borrador (E)', '画笔 (B)': 'Pincel (B)', '演奏模式 (P)': 'Modo de interpretación (P)',
        '播放/暂停 (Space)': 'Reproducir/Pausar (Espacio)', '开始录制 (Space)': 'Iniciar grabación (Espacio)', '停止 (Esc)': 'Detener (Esc)', '选择乐器': 'Seleccionar instrumento',
        '缩放精度': 'Escalar precisión', '音调偏移': 'Transposición', '延音填充': 'Rellenar sostenido', '清除延音': 'Borrar sostenido', '上下起伏': 'Movimiento de arpegio', '转8度内': 'Ajustar a 2 octavas', '音域处理': 'Procesar rango', '清除空轨道': 'Eliminar pistas vacías',
        '新建文件': 'Nuevo archivo', '打开文件': 'Abrir archivo', '保存': 'Guardar', '导出 NBS': 'Exportar NBS', '取消': 'Cancelar', '导入': 'Importar', '基本设置': 'Básico', '音轨': 'Pistas', '音色拟合': 'Ajuste de timbre',
        '读取音符力度': 'Leer velocidad de nota', '音符吸附': 'Ajustar notas', '歌曲精度:': 'Precisión de la canción:', '拍子:': 'Pulso:', '延音处理:': 'Sostenido:', '移除无音符音轨': 'Eliminar pistas vacías',
        '全选': 'Seleccionar todo', '取消选择': 'Deseleccionar', '复制': 'Copiar', '剪切': 'Cortar', '粘贴': 'Pegar', '删除': 'Eliminar', '更改乐器': 'Cambiar instrumento', '更改音量': 'Cambiar volumen',
        '静音': 'Silenciar', '取消静音': 'Activar sonido', '独奏': 'Solo', '取消独奏': 'Quitar solo', '删除音轨': 'Eliminar pista', '上移轨道': 'Subir pista', '下移轨道': 'Bajar pista', '音量:': 'Volumen:', '关闭': 'Cerrar'
    }, ['Arpa', 'Contrabajo', 'Bombo', 'Caja', 'Chasquido', 'Guitarra', 'Flauta', 'Campana', 'Campanillas', 'Xilófono', 'Xilófono de hierro', 'Cencerro', 'Didgeridoo', 'Bit', 'Banjo', 'Pling', 'Cuerno de cobre', 'Cuerno de cobre expuesto', 'Cuerno de cobre erosionado', 'Cuerno de cobre oxidado']);

    addLocale('ru-RU', {
        page_title: 'NoteBlockWeb - Редактор нотных блоков Minecraft', language: 'Язык', settings: 'Настройки', about: 'О программе', functions: 'Инструменты',
        privacy_title: 'Уведомление о конфиденциальности', privacy_message: 'Сервис обрабатывает выбранный MIDI- или NBS-файл только в текущем сеансе. Содержимое файла не хранится постоянно, персональные данные не собираются.',
        agree: 'Принять', feedback: 'Обратная связь', open_source: 'Библиотеки с открытым исходным кодом', update_notes: 'Что нового', close: 'Закрыть', file: 'Файл', keyboard_piano: 'Клавиатура пианино', midi_import: 'Импорт MIDI'
    }, {
        '文件': 'Файл', '速度': 'Темп', '撤销': 'Отменить', '重做': 'Повторить', '设置': 'Настройки', '关于': 'О программе', '功能': 'Инструменты', '更多': 'Ещё',
        '钢琴键盘': 'Клавиатура пианино', '使用键盘触发钢琴': 'Использовать клавиатуру компьютера как пианино', '折叠音轨列表': 'Свернуть список дорожек',
        '默认工具 (D)': 'Основной инструмент (D)', '选择工具 (S)': 'Инструмент выделения (S)', '橡皮擦 (E)': 'Ластик (E)', '画笔 (B)': 'Кисть (B)', '演奏模式 (P)': 'Режим исполнения (P)',
        '播放/暂停 (Space)': 'Воспроизвести/Пауза (Пробел)', '开始录制 (Space)': 'Начать запись (Пробел)', '停止 (Esc)': 'Стоп (Esc)', '选择乐器': 'Выбрать инструмент',
        '缩放精度': 'Масштаб точности', '音调偏移': 'Сдвиг высоты', '延音填充': 'Заполнить сустейн', '清除延音': 'Очистить сустейн', '上下起伏': 'Движение арпеджио', '转8度内': 'Свести к 2 октавам', '音域处理': 'Обработать диапазон', '清除空轨道': 'Удалить пустые дорожки',
        '新建文件': 'Новый файл', '打开文件': 'Открыть файл', '保存': 'Сохранить', '导出 NBS': 'Экспорт NBS', '取消': 'Отмена', '导入': 'Импорт', '基本设置': 'Основное', '音轨': 'Дорожки', '音色拟合': 'Подбор тембра',
        '读取音符力度': 'Читать силу ноты', '音符吸附': 'Привязка нот', '歌曲精度:': 'Точность песни:', '拍子:': 'Доля:', '延音处理:': 'Сустейн:', '移除无音符音轨': 'Удалить пустые дорожки',
        '全选': 'Выбрать всё', '取消选择': 'Снять выделение', '复制': 'Копировать', '剪切': 'Вырезать', '粘贴': 'Вставить', '删除': 'Удалить', '更改乐器': 'Изменить инструмент', '更改音量': 'Изменить громкость',
        '静音': 'Выключить звук', '取消静音': 'Включить звук', '独奏': 'Соло', '取消独奏': 'Убрать соло', '删除音轨': 'Удалить дорожку', '上移轨道': 'Переместить дорожку вверх', '下移轨道': 'Переместить дорожку вниз', '音量:': 'Громкость:', '关闭': 'Закрыть'
    }, ['Арфа', 'Контрабас', 'Большой барабан', 'Малый барабан', 'Щелчок', 'Гитара', 'Флейта', 'Колокол', 'Перезвон', 'Ксилофон', 'Железный ксилофон', 'Коровий колокольчик', 'Диджериду', 'Бит', 'Банджо', 'Плинг', 'Медный рог', 'Открытый медный рог', 'Потемневший медный рог', 'Окисленный медный рог']);

    addLocale('de-DE', {
        page_title: 'NoteBlockWeb - Minecraft-Notenblock-Editor', language: 'Sprache', settings: 'Einstellungen', about: 'Info', functions: 'Werkzeuge',
        privacy_title: 'Datenschutzhinweis', privacy_message: 'Dieser Dienst verarbeitet die ausgewählte MIDI- oder NBS-Datei nur während der aktuellen Sitzung. Der Dateiinhalt wird nicht dauerhaft gespeichert und es werden keine personenbezogenen Daten erfasst.',
        agree: 'Zustimmen', feedback: 'Feedback', open_source: 'Open-Source-Bibliotheken', update_notes: 'Neuigkeiten', close: 'Schließen', file: 'Datei', keyboard_piano: 'Klaviatur', midi_import: 'MIDI importieren'
    }, {
        '文件': 'Datei', '速度': 'Tempo', '撤销': 'Rückgängig', '重做': 'Wiederholen', '设置': 'Einstellungen', '关于': 'Info', '功能': 'Werkzeuge', '更多': 'Mehr',
        '钢琴键盘': 'Klaviatur', '使用键盘触发钢琴': 'Computertastatur als Klavier verwenden', '折叠音轨列表': 'Spurliste einklappen',
        '默认工具 (D)': 'Standardwerkzeug (D)', '选择工具 (S)': 'Auswahlwerkzeug (S)', '橡皮擦 (E)': 'Radierer (E)', '画笔 (B)': 'Pinsel (B)', '演奏模式 (P)': 'Spielmodus (P)',
        '播放/暂停 (Space)': 'Wiedergabe/Pause (Leertaste)', '开始录制 (Space)': 'Aufnahme starten (Leertaste)', '停止 (Esc)': 'Stopp (Esc)', '选择乐器': 'Instrument auswählen',
        '缩放精度': 'Rastergenauigkeit', '音调偏移': 'Tonhöhenverschiebung', '延音填充': 'Sustain füllen', '清除延音': 'Sustain löschen', '上下起伏': 'Arpeggio-Bewegung', '转8度内': 'Auf 2 Oktaven reduzieren', '音域处理': 'Tonumfang verarbeiten', '清除空轨道': 'Leere Spuren entfernen',
        '新建文件': 'Neue Datei', '打开文件': 'Datei öffnen', '保存': 'Speichern', '导出 NBS': 'NBS exportieren', '取消': 'Abbrechen', '导入': 'Importieren', '基本设置': 'Grundlagen', '音轨': 'Spuren', '音色拟合': 'Klangfarbenanpassung',
        '读取音符力度': 'Notenanschlag lesen', '音符吸附': 'Noten einrasten', '歌曲精度:': 'Songauflösung:', '拍子:': 'Takt:', '延音处理:': 'Sustain:', '移除无音符音轨': 'Leere Spuren entfernen',
        '全选': 'Alles auswählen', '取消选择': 'Auswahl aufheben', '复制': 'Kopieren', '剪切': 'Ausschneiden', '粘贴': 'Einfügen', '删除': 'Löschen', '更改乐器': 'Instrument ändern', '更改音量': 'Lautstärke ändern',
        '静音': 'Stummschalten', '取消静音': 'Stummschaltung aufheben', '独奏': 'Solo', '取消独奏': 'Solo aufheben', '删除音轨': 'Spur löschen', '上移轨道': 'Spur nach oben', '下移轨道': 'Spur nach unten', '音量:': 'Lautstärke:', '关闭': 'Schließen'
    }, ['Harfe', 'Kontrabass', 'Basstrommel', 'Snare Drum', 'Klick', 'Gitarre', 'Flöte', 'Glocke', 'Klangspiel', 'Xylophon', 'Eisenxylophon', 'Kuhglocke', 'Didgeridoo', 'Bit', 'Banjo', 'Pling', 'Kupferhorn', 'Freiliegendes Kupferhorn', 'Verwittertes Kupferhorn', 'Oxidiertes Kupferhorn']);

    addLocale('fr-FR', {
        page_title: 'NoteBlockWeb - Éditeur de blocs musicaux Minecraft', language: 'Langue', settings: 'Paramètres', about: 'À propos', functions: 'Outils',
        privacy_title: 'Avis de confidentialité', privacy_message: 'Ce service traite le fichier MIDI ou NBS choisi uniquement pendant la session en cours. Le contenu du fichier n’est pas conservé et aucune donnée personnelle n’est collectée.',
        agree: 'Accepter', feedback: 'Commentaires', open_source: 'Bibliothèques open source', update_notes: 'Nouveautés', close: 'Fermer', file: 'Fichier', keyboard_piano: 'Clavier de piano', midi_import: 'Importer un MIDI'
    }, {
        '文件': 'Fichier', '速度': 'Tempo', '撤销': 'Annuler', '重做': 'Rétablir', '设置': 'Paramètres', '关于': 'À propos', '功能': 'Outils', '更多': 'Plus',
        '钢琴键盘': 'Clavier de piano', '使用键盘触发钢琴': 'Utiliser le clavier de l’ordinateur comme piano', '折叠音轨列表': 'Réduire la liste des pistes',
        '默认工具 (D)': 'Outil par défaut (D)', '选择工具 (S)': 'Outil de sélection (S)', '橡皮擦 (E)': 'Gomme (E)', '画笔 (B)': 'Pinceau (B)', '演奏模式 (P)': 'Mode interprétation (P)',
        '播放/暂停 (Space)': 'Lecture/Pause (Espace)', '开始录制 (Space)': 'Démarrer l’enregistrement (Espace)', '停止 (Esc)': 'Arrêter (Échap)', '选择乐器': 'Choisir un instrument',
        '缩放精度': 'Précision de grille', '音调偏移': 'Décalage de hauteur', '延音填充': 'Remplir le sustain', '清除延音': 'Effacer le sustain', '上下起伏': 'Mouvement d’arpège', '转8度内': 'Ramener à 2 octaves', '音域处理': 'Traiter la tessiture', '清除空轨道': 'Supprimer les pistes vides',
        '新建文件': 'Nouveau fichier', '打开文件': 'Ouvrir un fichier', '保存': 'Enregistrer', '导出 NBS': 'Exporter NBS', '取消': 'Annuler', '导入': 'Importer', '基本设置': 'Base', '音轨': 'Pistes', '音色拟合': 'Ajustement de timbre',
        '读取音符力度': 'Lire la vélocité des notes', '音符吸附': 'Magnétisme des notes', '歌曲精度:': 'Précision du morceau :', '拍子:': 'Temps :', '延音处理:': 'Sustain :', '移除无音符音轨': 'Supprimer les pistes vides',
        '全选': 'Tout sélectionner', '取消选择': 'Désélectionner', '复制': 'Copier', '剪切': 'Couper', '粘贴': 'Coller', '删除': 'Supprimer', '更改乐器': 'Changer d’instrument', '更改音量': 'Changer le volume',
        '静音': 'Couper le son', '取消静音': 'Rétablir le son', '独奏': 'Solo', '取消独奏': 'Annuler le solo', '删除音轨': 'Supprimer la piste', '上移轨道': 'Monter la piste', '下移轨道': 'Descendre la piste', '音量:': 'Volume :', '关闭': 'Fermer'
    }, ['Harpe', 'Contrebasse', 'Grosse caisse', 'Caisse claire', 'Clic', 'Guitare', 'Flûte', 'Cloche', 'Carillon', 'Xylophone', 'Xylophone en fer', 'Cloche de vache', 'Didgeridoo', 'Bit', 'Banjo', 'Pling', 'Corne de cuivre', 'Corne de cuivre exposée', 'Corne de cuivre altérée', 'Corne de cuivre oxydée']);

    addLocale('ja-JP', {
        page_title: 'NoteBlockWeb - Minecraft 音符ブロックエディター', language: '言語', settings: '設定', about: '情報', functions: 'ツール',
        privacy_title: 'プライバシーに関するお知らせ', privacy_message: 'このサービスは、選択した MIDI または NBS ファイルを現在のセッション中にのみ処理します。ファイル内容を恒久的に保存したり、個人情報を収集したりすることはありません。',
        agree: '同意する', feedback: 'フィードバック', open_source: 'オープンソースライブラリ', update_notes: '更新情報', close: '閉じる', file: 'ファイル', keyboard_piano: 'ピアノ鍵盤', midi_import: 'MIDI をインポート'
    }, {
        '文件': 'ファイル', '速度': 'テンポ', '撤销': '元に戻す', '重做': 'やり直す', '设置': '設定', '关于': '情報', '功能': 'ツール', '更多': 'その他',
        '钢琴键盘': 'ピアノ鍵盤', '使用键盘触发钢琴': 'キーボードでピアノを鳴らす', '折叠音轨列表': 'トラック一覧を折りたたむ',
        '默认工具 (D)': '標準ツール (D)', '选择工具 (S)': '選択ツール (S)', '橡皮擦 (E)': '消しゴム (E)', '画笔 (B)': 'ブラシ (B)', '演奏模式 (P)': '演奏モード (P)',
        '播放/暂停 (Space)': '再生/一時停止 (Space)', '开始录制 (Space)': '録音を開始 (Space)', '停止 (Esc)': '停止 (Esc)', '选择乐器': '楽器を選択',
        '缩放精度': 'グリッド精度', '音调偏移': '音程シフト', '延音填充': 'サステインを補完', '清除延音': 'サステインを削除', '上下起伏': 'アルペジオの動き', '转8度内': '2 オクターブ内に収める', '音域处理': '音域を処理', '清除空轨道': '空のトラックを削除',
        '新建文件': '新規ファイル', '打开文件': 'ファイルを開く', '保存': '保存', '导出 NBS': 'NBS をエクスポート', '取消': 'キャンセル', '导入': 'インポート', '基本设置': '基本設定', '音轨': 'トラック', '音色拟合': '音色フィッティング',
        '读取音符力度': 'ノートベロシティを読み取る', '音符吸附': 'ノートスナップ', '歌曲精度:': '曲の精度:', '拍子:': '拍:', '延音处理:': 'サステイン:', '移除无音符音轨': '空のトラックを削除',
        '全选': 'すべて選択', '取消选择': '選択解除', '复制': 'コピー', '剪切': '切り取り', '粘贴': '貼り付け', '删除': '削除', '更改乐器': '楽器を変更', '更改音量': '音量を変更',
        '静音': 'ミュート', '取消静音': 'ミュート解除', '独奏': 'ソロ', '取消独奏': 'ソロ解除', '删除音轨': 'トラックを削除', '上移轨道': 'トラックを上へ', '下移轨道': 'トラックを下へ', '音量:': '音量:', '关闭': '閉じる'
    }, ['ハープ', 'コントラバス', 'バスドラム', 'スネアドラム', 'クリック', 'ギター', 'フルート', 'ベル', 'チャイム', 'シロフォン', '鉄のシロフォン', 'カウベル', 'ディジュリドゥ', 'ビット', 'バンジョー', 'プリング', '銅の角笛', '風化していない銅の角笛', '風化した銅の角笛', '酸化した銅の角笛']);

    addLocale('ko-KR', {
        page_title: 'NoteBlockWeb - Minecraft 노트 블록 편집기', language: '언어', settings: '설정', about: '정보', functions: '도구',
        privacy_title: '개인정보 보호 안내', privacy_message: '이 서비스는 선택한 MIDI 또는 NBS 파일을 현재 세션에서만 처리합니다. 파일 내용은 영구적으로 저장되지 않으며 개인 정보도 수집하지 않습니다.',
        agree: '동의', feedback: '피드백', open_source: '오픈 소스 라이브러리', update_notes: '새로운 기능', close: '닫기', file: '파일', keyboard_piano: '피아노 건반', midi_import: 'MIDI 가져오기'
    }, {
        '文件': '파일', '速度': '템포', '撤销': '실행 취소', '重做': '다시 실행', '设置': '설정', '关于': '정보', '功能': '도구', '更多': '더보기',
        '钢琴键盘': '피아노 건반', '使用键盘触发钢琴': '컴퓨터 키보드로 피아노 연주', '折叠音轨列表': '트랙 목록 접기',
        '默认工具 (D)': '기본 도구 (D)', '选择工具 (S)': '선택 도구 (S)', '橡皮擦 (E)': '지우개 (E)', '画笔 (B)': '브러시 (B)', '演奏模式 (P)': '연주 모드 (P)',
        '播放/暂停 (Space)': '재생/일시 정지 (Space)', '开始录制 (Space)': '녹음 시작 (Space)', '停止 (Esc)': '정지 (Esc)', '选择乐器': '악기 선택',
        '缩放精度': '격자 정밀도', '音调偏移': '음높이 이동', '延音填充': '서스테인 채우기', '清除延音': '서스테인 지우기', '上下起伏': '아르페지오 움직임', '转8度内': '2옥타브로 맞추기', '音域处理': '음역 처리', '清除空轨道': '빈 트랙 삭제',
        '新建文件': '새 파일', '打开文件': '파일 열기', '保存': '저장', '导出 NBS': 'NBS 내보내기', '取消': '취소', '导入': '가져오기', '基本设置': '기본 설정', '音轨': '트랙', '音色拟合': '음색 맞춤',
        '读取音符力度': '노트 벨로시티 읽기', '音符吸附': '노트 스냅', '歌曲精度:': '곡 정밀도:', '拍子:': '박자:', '延音处理:': '서스테인:', '移除无音符音轨': '빈 트랙 삭제',
        '全选': '모두 선택', '取消选择': '선택 해제', '复制': '복사', '剪切': '잘라내기', '粘贴': '붙여넣기', '删除': '삭제', '更改乐器': '악기 변경', '更改音量': '음량 변경',
        '静音': '음소거', '取消静音': '음소거 해제', '独奏': '솔로', '取消独奏': '솔로 해제', '删除音轨': '트랙 삭제', '上移轨道': '트랙 위로', '下移轨道': '트랙 아래로', '音量:': '음량:', '关闭': '닫기'
    }, ['하프', '더블 베이스', '베이스 드럼', '스네어 드럼', '클릭', '기타', '플루트', '종', '차임', '실로폰', '철 실로폰', '카우벨', '디저리두', '비트', '밴조', '플링', '구리 뿔피리', '노출된 구리 뿔피리', '풍화된 구리 뿔피리', '산화된 구리 뿔피리']);

    function normalize(locale) {
        if (typeof locale !== 'string') return null;
        var value = locale.replace(/_/g, '-').trim();
        for (var i = 0; i < SUPPORTED.length; i++) if (value.toLowerCase() === SUPPORTED[i].toLowerCase()) return SUPPORTED[i];
        var fallback = { zh: 'zh-CN', en: 'en-US', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU', de: 'de-DE', fr: 'fr-FR', ja: 'ja-JP', ko: 'ko-KR', id: 'id-ID' };
        return fallback[value.split('-')[0].toLowerCase()] || null;
    }

    function detect() {
        try { var stored = normalize(localStorage.getItem(STORAGE_KEY)); if (stored) return stored; } catch (ignore) {}
        var candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
        for (var i = 0; i < candidates.length; i++) { var locale = normalize(candidates[i]); if (locale) return locale; }
        return 'en-US';
    }

    function t(key) { return (TEXT[current] && TEXT[current][key]) || TEXT['en-US'][key] || key; }

    // Dynamic UI often contains counts or track names. Translate the stable
    // surrounding text without attempting to translate user-provided names.
    function translatePattern(text) {
        var patterns = {
            'en-US': [
                [/^音符:\s*(\d+)$/, 'Notes: $1'], [/^位置:\s*(\d+)$/, 'Position: $1'],
                [/^录制到:\s*(.+)$/, 'Recording to: $1'], [/^已选择\s*(\d+)\s*个音符$/, '$1 note(s) selected'],
                [/^已选择\s*(\d+)\s*个轨道$/, '$1 track(s) selected'], [/^长度\s*(\d+)\s*步\s*·\s*(\d+)\s*个音符$/, 'Length $1 steps · $2 note(s)'],
                [/^吸附到:\s*(.+)\s*\(每\s*(\d+)\s*tick\)$/, 'Snap to: $1 (every $2 ticks)'], [/^吸附网格:\s*(\d+)\s*tick$/, 'Snap grid: $1 ticks'],
                [/^已连接:\s*(.+)$/, 'Connected: $1'], [/^已连接\s+(.+)$/, 'Connected $1'], [/^MIDI 输入\s*(.+)$/, 'MIDI input $1'],
                [/^预计\s*(.+)$/, 'Estimated $1'], [/^已处理\s*(\d+)\s*个音符。$/, 'Processed $1 note(s).'],
                [/^当前只选中了\s*(\d+)\s*个音符。$/, 'Only $1 note(s) are selected.'],
                [/^已完成音域处理，调整了\s*(\d+)\s*个音符。$/, 'Range processing complete. Adjusted $1 note(s).'],
                [/^已处理\s*(\d+)\s*个音符，超出 Minecraft 标准音域的音符已按八度折叠。$/, 'Processed $1 note(s). Notes outside the Minecraft range were folded by octave.'],
                [/^范围: (.+?) \((\d+) 个八度\)$/, 'Range: $1 ($2 octaves)'],
                [/^通道 <b>(\d+)<\/b>$/, 'Channel <b>$1</b>'],
                [/^已选择:\s*(\d+)\s*$/, 'Selected: $1'], [/^已选择:\s*(\d+)\s*个音符$/, 'Selected: $1 note(s)'],
                // 音域处理模式提示 (textContent 拼接的完整字符串)
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 不进行音域转换$/, 'Minecraft range F#3-F#5 (MIDI 54-78) · No range conversion'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 超出音域的音符会按八度归一$/, 'Minecraft range F#3-F#5 (MIDI 54-78) · Out-of-range notes folded by octave'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移、音色替代并强制归位$/, 'Minecraft range F#3-F#5 (MIDI 54-78) · Auto-shift, timbre substitution, and forced fold'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移并按需使用音色替代$/, 'Minecraft range F#3-F#5 (MIDI 54-78) · Auto-shift with on-demand timbre substitution'],
                // 音色库状态 (名称与引擎名也需翻译)
                [/^(.+) 已就绪 \((\d+) 个预设(?:, (.+))?\)$/, function(m, name, n, extra) {
                    return translate(name) + ' ready (' + n + ' presets' + (extra ? ', ' + translate(extra) : '') + ')';
                }],
                [/^(.+) 音色库已就绪 \((\d+) 个预设\)$/, function(m, name, n) {
                    return translate(name) + ' soundfont ready (' + n + ' presets)';
                }],
                [/^(.+) 音色库已就绪 \((.+)\) \((\d+) 个预设\)$/, function(m, name, eng, n) {
                    return translate(name) + ' soundfont ready (' + translate(eng) + ') (' + n + ' presets)';
                }],
                [/^正在下载 (.+)\.\.\.$/, function(m, name) { return 'Downloading ' + translate(name) + '...'; }],
                // 默认音轨名
                [/^音轨 (\d+)$/, 'Track $1'],
                // 错误消息 (前缀 + 内部消息递归翻译)
                [/^加载失败: (.+)$/, function(m, msg) { return 'Load failed: ' + translate(msg); }],
                [/^保存失败: (.+)$/, function(m, msg) { return 'Save failed: ' + translate(msg); }],
                [/^导出失败: (.+)$/, function(m, msg) { return 'Export failed: ' + translate(msg); }],
                [/^MIDI 导入失败: (.+)$/, function(m, msg) { return 'MIDI import failed: ' + translate(msg); }],
                [/^MIDI 粘贴失败: (.+)$/, function(m, msg) { return 'MIDI paste failed: ' + translate(msg); }],
                [/^读取 MIDI 信息失败: (.+)$/, function(m, msg) { return 'Failed to read MIDI info: ' + translate(msg); }],
                [/^错误: (.+)$/, function(m, msg) { return 'Error: ' + translate(msg); }],
                [/^加载NBS文件失败: (.+)$/, function(m, msg) { return 'Failed to load NBS file: ' + translate(msg); }],
                [/^导出NBS失败: (.+)$/, function(m, msg) { return 'NBS export failed: ' + translate(msg); }],
                [/^导入MIDI失败: (.+)$/, function(m, msg) { return 'MIDI import failed: ' + translate(msg); }],
                [/^读取MIDI信息失败: (.+)$/, function(m, msg) { return 'Failed to read MIDI info: ' + translate(msg); }],
                [/^请求失败 \((\d+)\)$/, 'Request failed ($1)'],
                [/^请求失败: (.+)$/, function(m, msg) { return 'Request failed: ' + translate(msg); }],
                // 确认对话框与命名
                [/^将删除\s*(\d+)\s*个空轨 \(从\s*(\d+)\s*减到\s*(\d+)\)，是否继续？$/, 'Delete $1 empty track(s) (from $2 down to $3)? Continue?'],
                [/^删除音轨 "(.+)" 及其所有 Clip\?$/, 'Delete track "$1" and all its clips?'],
                [/^(.+) \(副本\)$/, '$1 (copy)'],
                [/^(.+) · (\d+) 音轨 · (\d+) 音符$/, '$1 · $2 track(s) · $3 note(s)'],
                // ============ 运行时补充正则 1 (en-US) ============
                // 通用动态句
                [/^已选择: (.+)$/, 'Selected: $1'], [/^乐器 (\d+)$/, 'Instrument $1'],
                [/^乐器 #(\d+)(.*)$/, function(m, num, rest) {
                    var s = 'Instrument #' + num;
                    if (rest) {
                        s += rest.replace(/\s*·\s*(立体声|单声道)\s*/g, function(mm, ch) { return ' · ' + translate(ch); })
                                .replace(/\s*·\s*基准\s*/g, ' · base ');
                    }
                    return s;
                }],
                [/^自定义音色 (\d+)$/, 'Custom instrument $1'], [/^自定义音色 #(\d+)$/, 'Custom instrument #$1'],
                [/^导入音色 (\d+)$/, 'Import instrument $1'], [/^(\d+) 轨道$/, '$1 track(s)'], [/^(\d+) 音符$/, '$1 note(s)'],
                [/^通道 (\d+) · (\d+) 音符$/, 'Channel $1 · $2 note(s)'], [/^鼓音符 (.+) · (.+)$/, 'Drum note $1 · $2'],
                [/^(.+)\(通道(\d+)\)$/, function(m, name, ch) { return translate(name) + ' (channel ' + ch + ')'; }], [/^(.+) \(超出范围\)$/, function(m, name) { return translate(name) + ' (out of range)'; }],
                [/^MIDI 文件格式损坏或数据不完整 \(轨道 (\d+)\)$/, 'MIDI file is corrupted or incomplete (track $1)'],
                [/^删除 Clip "(.+)"\?$/, 'Delete clip "$1"?'], [/^\(槽位 (\d+)\)$/, '(slot $1)'],
                // 自定义音色导入/修正流程
                [/^来源文件: (.+) \(([\d.]+) MB\)$/, 'Source file: $1 ($2 MB)'],
                [/^来源文件: (.+) \(([\d.]+) MB\) · 已按修正结果转换$/, 'Source file: $1 ($2 MB) · converted per correction'],
                [/^检测音高: (.+)$/, 'Detected pitch: $1'],
                [/^当前修正倍率 ×([\d.]+)。可点「试听」对比修正效果；满意后点下一步。$/, 'Current correction ratio ×$1. Click "Preview" to compare; click Next when satisfied.'],
                [/^播放修正后采样 · 倍率 ×([\d.]+) · 输出基准 (.+)$/, 'Corrected sample playback · ratio ×$1 · output base $2'],
                [/^已导入自定义音色「(.+)」，可在乐器选择中选用$/, 'Custom instrument "$1" imported. Select it in the instrument picker.'],
                [/^确定删除自定义音色「(.+)」吗？\n引用该音色的 NBS 文件中对应乐器将静音。$/, 'Delete custom instrument "$1"?\nInstruments referencing it in NBS files will be silent.'],
                // 消除重复音符
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = 'No duplicate notes found.\nCriterion: same tick, same instrument and same pitch, ignoring velocity.';
                    if (k) s += '\n\nHint: ' + k + ' note(s) share the same tick and pitch but differ in instrument';
                    if (i) s += '\nHint: ' + i + ' note(s) share the same tick and instrument but differ in pitch';
                    if (t) s += '\nHint: ' + t + ' note(s) share the same instrument and pitch but differ in tick';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, 'Delete $1 duplicate note(s)? Continue?'],
                [/^已删除 (\d+) 个重复音符$/, 'Deleted $1 duplicate note(s)'],
                // 歌曲压缩
                [/^删除 (\d+) 个音符，保留 (\d+) 个。$/, 'Removed $1 note(s), kept $2.'],
                [/^压缩后上移填补了 (\d+) 个音符。$/, 'Moved $1 note(s) upward to fill the gaps.'],
                // 作品包 / 音色备份
                [/^作品包已导出，包含 (\d+) 个自定义音色音频。\n把 zip 分享给他人，导入后即可完整还原音色与歌曲。$/, 'Song pack exported with $1 custom-instrument audio file(s).\nShare the zip; importing it fully restores the instruments and song.'],
                [/^作品包导出失败: (.+)$/, function(m, msg) { return 'Song pack export failed: ' + translate(msg); }], [/^NBS 打包失败: (.+)$/, function(m, msg) { return 'NBS packing failed: ' + translate(msg); }],
                [/^已导出 (\d+) 个音色的备份。浏览器数据丢失后可随时导入恢复。$/, 'Backed up $1 instrument(s). You can import the backup anytime after losing browser data.'],
                [/^备份导出失败: (.+)$/, function(m, msg) { return 'Backup export failed: ' + translate(msg); }],
                [/^已存在同名音色「(.+)」，但音频内容不同。\n\n请选择处理方式：$/, 'An instrument named "$1" already exists, but the audio differs.\n\nChoose how to proceed:'],
                [/^音色备份导入完成（(\d+) 项）。$/, 'Instrument backup imported ($1 item(s)).'], [/^压缩包缺少 (.+)$/, 'The package is missing $1'],
                [/^无法识别的压缩包类型: (.+)$/, function(m, msg) { return 'Unrecognized package type: ' + translate(msg); }], [/^导入失败: (.+)$/, function(m, msg) { return 'Import failed: ' + translate(msg); }],
                [/^(.+) \(导入\)$/, '$1 (imported)'], [/^(.+) \(自定义音色\)$/, '$1 (custom instrument)']
            ],
            'ja-JP': [
                [/^音符:\s*(\d+)$/, '音符: $1'], [/^位置:\s*(\d+)$/, '位置: $1'],
                [/^录制到:\s*(.+)$/, '録音先: $1'], [/^已选择\s*(\d+)\s*个音符$/, '$1 ノートを選択中'],
                [/^已选择\s*(\d+)\s*个轨道$/, '$1 トラックを選択中'], [/^长度\s*(\d+)\s*步\s*·\s*(\d+)\s*个音符$/, '長さ $1 ステップ · $2 ノート'],
                [/^吸附到:\s*(.+)\s*\(每\s*(\d+)\s*tick\)$/, 'スナップ先: $1 (毎 $2 tick)'], [/^吸附网格:\s*(\d+)\s*tick$/, 'スナップグリッド: $1 tick'],
                [/^已连接:\s*(.+)$/, '接続済み: $1'], [/^已连接\s+(.+)$/, '接続済み $1'], [/^MIDI 输入\s*(.+)$/, 'MIDI 入力 $1'],
                [/^预计\s*(.+)$/, '推定: $1'], [/^已处理\s*(\d+)\s*个音符。$/, '$1 ノートを処理しました。'],
                [/^当前只选中了\s*(\d+)\s*个音符。$/, '現在 $1 ノートのみ選択されています。'],
                [/^已完成音域处理，调整了\s*(\d+)\s*个音符。$/, '音域処理が完了しました。$1 ノートを調整しました。'],
                [/^已处理\s*(\d+)\s*个音符，超出 Minecraft 标准音域的音符已按八度折叠。$/, '$1 ノートを処理しました。Minecraft 標準音域外のノートはオクターブ単位で折り返しました。'],
                [/^范围: (.+?) \((\d+) 个八度\)$/, '範囲: $1 ($2 オクターブ)'],
                [/^通道 <b>(\d+)<\/b>$/, 'チャンネル <b>$1</b>'],
                [/^已选择:\s*(\d+)\s*$/, '選択済み: $1'], [/^已选择:\s*(\d+)\s*个音符$/, '選択済み: $1 ノート'],
                // 音域处理模式提示 (整句)
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 不进行音域转换$/, 'Minecraft 音域 F#3-F#5 (MIDI 54-78) · 音域変換なし'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 超出音域的音符会按八度归一$/, 'Minecraft 音域 F#3-F#5 (MIDI 54-78) · 範囲外のノートはオクターブで折り返し'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移、音色替代并强制归位$/, 'Minecraft 音域 F#3-F#5 (MIDI 54-78) · 自動シフト・音色置換・強制折り返し'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移并按需使用音色替代$/, 'Minecraft 音域 F#3-F#5 (MIDI 54-78) · 自動シフト・必要に応じて音色置換'],
                // 音色库状态 (名称与引擎名也需翻译)
                [/^(.+) 已就绪 \((\d+) 个预设(?:, (.+))?\)$/, function(m, name, n, extra) {
                    return translate(name) + ' 準備完了 (' + n + ' プリセット' + (extra ? ', ' + translate(extra) : '') + ')';
                }],
                [/^(.+) 音色库已就绪 \((\d+) 个预设\)$/, function(m, name, n) {
                    return translate(name) + ' 音色ライブラリ準備完了 (' + n + ' プリセット)';
                }],
                [/^(.+) 音色库已就绪 \((.+)\) \((\d+) 个预设\)$/, function(m, name, eng, n) {
                    return translate(name) + ' 音色ライブラリ準備完了 (' + translate(eng) + ') (' + n + ' プリセット)';
                }],
                [/^正在下载 (.+)\.\.\.$/, function(m, name) { return translate(name) + ' をダウンロード中...'; }],
                // 默认音轨名
                [/^音轨 (\d+)$/, 'トラック $1'],
                // 错误消息 (前缀 + 内部消息递归翻译)
                [/^加载失败: (.+)$/, function(m, msg) { return '読み込みに失敗: ' + translate(msg); }],
                [/^保存失败: (.+)$/, function(m, msg) { return '保存に失敗: ' + translate(msg); }],
                [/^导出失败: (.+)$/, function(m, msg) { return 'エクスポートに失敗: ' + translate(msg); }],
                [/^MIDI 导入失败: (.+)$/, function(m, msg) { return 'MIDI インポートに失敗: ' + translate(msg); }],
                [/^MIDI 粘贴失败: (.+)$/, function(m, msg) { return 'MIDI 貼り付けに失敗: ' + translate(msg); }],
                [/^读取 MIDI 信息失败: (.+)$/, function(m, msg) { return 'MIDI 情報の読み取りに失敗: ' + translate(msg); }],
                [/^错误: (.+)$/, function(m, msg) { return 'エラー: ' + translate(msg); }],
                [/^加载NBS文件失败: (.+)$/, function(m, msg) { return 'NBS ファイルの読み込みに失敗: ' + translate(msg); }],
                [/^导出NBS失败: (.+)$/, function(m, msg) { return 'NBS エクスポートに失敗: ' + translate(msg); }],
                [/^导入MIDI失败: (.+)$/, function(m, msg) { return 'MIDI インポートに失敗: ' + translate(msg); }],
                [/^读取MIDI信息失败: (.+)$/, function(m, msg) { return 'MIDI 情報の読み取りに失敗: ' + translate(msg); }],
                [/^请求失败 \((\d+)\)$/, 'リクエストに失敗 ($1)'],
                [/^请求失败: (.+)$/, function(m, msg) { return 'リクエストに失敗: ' + translate(msg); }],
                // 確認ダイアログ・命名
                [/^将删除\s*(\d+)\s*个空轨 \(从\s*(\d+)\s*减到\s*(\d+)\)，是否继续？$/, '$1 個の空トラックを削除します (全 $2 → $3)。続行しますか?'],
                [/^删除音轨 "(.+)" 及其所有 Clip\?$/, 'トラック「$1」とそのすべての Clip を削除しますか?'],
                [/^(.+) \(副本\)$/, '$1 (コピー)'],
                [/^(.+) · (\d+) 音轨 · (\d+) 音符$/, '$1 · $2 トラック · $3 ノート'],
                // ============ 运行时补充正则 1 (ja-JP) ============
                [/^已选择: (.+)$/, '選択: $1'], [/^乐器 (\d+)$/, '楽器 $1'],
                [/^乐器 #(\d+)(.*)$/, function(m, num, rest) {
                    var s = '楽器 #' + num;
                    if (rest) {
                        s += rest.replace(/\s*·\s*(立体声|单声道)\s*/g, function(mm, ch) { return ' · ' + translate(ch); })
                                .replace(/\s*·\s*基准\s*/g, ' · 基準 ');
                    }
                    return s;
                }],
                [/^自定义音色 (\d+)$/, 'カスタム楽器 $1'], [/^自定义音色 #(\d+)$/, 'カスタム楽器 #$1'],
                [/^导入音色 (\d+)$/, 'インポート音色 $1'], [/^(\d+) 轨道$/, '$1 トラック'], [/^(\d+) 音符$/, '$1 ノート'],
                [/^通道 (\d+) · (\d+) 音符$/, 'チャンネル $1 · $2 ノート'], [/^鼓音符 (.+) · (.+)$/, 'ドラムノート $1 · $2'],
                [/^(.+)\(通道(\d+)\)$/, function(m, name, ch) { return translate(name) + '（チャンネル' + ch + '）'; }], [/^(.+) \(超出范围\)$/, function(m, name) { return translate(name) + '（範囲外）'; }],
                [/^MIDI 文件格式损坏或数据不完整 \(轨道 (\d+)\)$/, 'MIDI ファイルが破損または不完全です（トラック $1）'],
                [/^删除 Clip "(.+)"\?$/, 'Clip「$1」を削除しますか?'], [/^\(槽位 (\d+)\)$/, '（スロット $1）'],
                // 自定义音色导入/修正流程
                [/^来源文件: (.+) \(([\d.]+) MB\)$/, 'ソースファイル: $1 ($2 MB)'],
                [/^来源文件: (.+) \(([\d.]+) MB\) · 已按修正结果转换$/, 'ソースファイル: $1 ($2 MB) · 修正結果で変換済み'],
                [/^检测音高: (.+)$/, '検出ピッチ: $1'],
                [/^当前修正倍率 ×([\d.]+)。可点「试听」对比修正效果；满意后点下一步。$/, '現在の修正倍率 ×$1。「試聴」で効果を比較できます。問題なければ次へ進みます。'],
                [/^播放修正后采样 · 倍率 ×([\d.]+) · 输出基准 (.+)$/, '修正後サンプルの再生 · 倍率 ×$1 · 出力基準 $2'],
                [/^已导入自定义音色「(.+)」，可在乐器选择中选用$/, 'カスタム楽器「$1」をインポートしました。楽器選択で使用できます。'],
                [/^确定删除自定义音色「(.+)」吗？\n引用该音色的 NBS 文件中对应乐器将静音。$/, 'カスタム楽器「$1」を削除しますか?\nこれを参照する NBS ファイルの対応楽器は無音になります。'],
                // 消除重复音符
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = '重複ノートは見つかりませんでした。\n判定基準: 同一時間(tick) + 同一音色 + 同一音程、音量差は無視。';
                    if (k) s += '\n\nヒント: ' + k + ' ノートが同一時間・同一音程だが音色が異なります (instrument が異なる)';
                    if (i) s += '\nヒント: ' + i + ' ノートが同一時間・同一音色だが音程が異なります (key が異なる)';
                    if (t) s += '\nヒント: ' + t + ' ノートが同一音色・同一音程だが時間が異なります (tick が異なる)';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, '重複ノート $1 個を削除します。続行しますか?'],
                [/^已删除 (\d+) 个重复音符$/, '$1 個の重複ノートを削除しました'],
                // 作品包 / 音色备份
                [/^作品包已导出，包含 (\d+) 个自定义音色音频。\n把 zip 分享给他人，导入后即可完整还原音色与歌曲。$/, '作品パックをエクスポートしました（カスタム楽器音声 $1 個を含む）。\nzip を共有すれば、インポート後に楽器と曲が完全に復元されます。'],
                [/^作品包导出失败: (.+)$/, function(m, msg) { return '作品パックのエクスポートに失敗: ' + translate(msg); }], [/^NBS 打包失败: (.+)$/, function(m, msg) { return 'NBS パッキングに失敗: ' + translate(msg); }],
                [/^已导出 (\d+) 个音色的备份。浏览器数据丢失后可随时导入恢复。$/, '$1 個の楽器バックアップをエクスポートしました。ブラウザデータが失われても、いつでもインポートして復元できます。'],
                [/^备份导出失败: (.+)$/, function(m, msg) { return 'バックアップのエクスポートに失敗: ' + translate(msg); }],
                [/^已存在同名音色「(.+)」，但音频内容不同。\n\n请选择处理方式：$/, '同名の楽器「$1」が既に存在しますが、音声内容が異なります。\n\n処理方法を選択してください:'],
                [/^音色备份导入完成（(\d+) 项）。$/, '楽器バックアップのインポートが完了しました（$1 項目）。'], [/^压缩包缺少 (.+)$/, 'パッケージに $1 がありません'],
                [/^无法识别的压缩包类型: (.+)$/, function(m, msg) { return '認識できないパッケージタイプ: ' + translate(msg); }], [/^导入失败: (.+)$/, function(m, msg) { return 'インポートに失敗: ' + translate(msg); }],
                [/^(.+) \(导入\)$/, '$1（インポート）'], [/^(.+) \(自定义音色\)$/, '$1（カスタム楽器）']
            ],
            'pt-BR': [
                [/^音符:\s*(\d+)$/, 'Notas: $1'], [/^位置:\s*(\d+)$/, 'Posição: $1'],
                [/^录制到:\s*(.+)$/, 'Gravando em: $1'], [/^已选择\s*(\d+)\s*个音符$/, '$1 nota(s) selecionada(s)'],
                [/^已选择\s*(\d+)\s*个轨道$/, '$1 faixa(s) selecionada(s)'], [/^长度\s*(\d+)\s*步\s*·\s*(\d+)\s*个音符$/, 'Duração $1 passos · $2 nota(s)'],
                [/^吸附到:\s*(.+)\s*\(每\s*(\d+)\s*tick\)$/, 'Quantizar em: $1 (a cada $2 ticks)'], [/^吸附网格:\s*(\d+)\s*tick$/, 'Grade: $1 ticks'],
                [/^已连接:\s*(.+)$/, 'Conectado: $1'], [/^已连接\s+(.+)$/, 'Conectado $1'], [/^MIDI 输入\s*(.+)$/, 'Entrada MIDI $1'],
                [/^预计\s*(.+)$/, 'Estimado: $1'], [/^已处理\s*(\d+)\s*个音符。$/, '$1 nota(s) processada(s).'],
                [/^当前只选中了\s*(\d+)\s*个音符。$/, 'Apenas $1 nota(s) está(ão) selecionada(s).'],
                [/^已完成音域处理，调整了\s*(\d+)\s*个音符。$/, 'Processamento de extensão concluído. $1 nota(s) ajustada(s).'],
                [/^已处理\s*(\d+)\s*个音符，超出 Minecraft 标准音域的音符已按八度折叠。$/, '$1 nota(s) processada(s). Notas fora da extensão do Minecraft foram dobradas por oitava.'],
                [/^范围: (.+?) \((\d+) 个八度\)$/, 'Extensão: $1 ($2 oitavas)'],
                [/^通道 <b>(\d+)<\/b>$/, 'Canal <b>$1</b>'],
                [/^已选择:\s*(\d+)\s*$/, 'Selecionado: $1'], [/^已选择:\s*(\d+)\s*个音符$/, 'Selecionado: $1 nota(s)'],
                // 音域处理模式提示 (整句)
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 不进行音域转换$/, 'Extensão do Minecraft F#3-F#5 (MIDI 54-78) · Sem conversão de extensão'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 超出音域的音符会按八度归一$/, 'Extensão do Minecraft F#3-F#5 (MIDI 54-78) · Notas fora da extensão dobradas por oitava'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移、音色替代并强制归位$/, 'Extensão do Minecraft F#3-F#5 (MIDI 54-78) · Auto-shift, substituição de timbre e dobra forçada'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移并按需使用音色替代$/, 'Extensão do Minecraft F#3-F#5 (MIDI 54-78) · Auto-shift com substituição de timbre sob demanda'],
                // 音色库状态 (名称与引擎名也需翻译)
                [/^(.+) 已就绪 \((\d+) 个预设(?:, (.+))?\)$/, function(m, name, n, extra) {
                    return translate(name) + ' pronto (' + n + ' presets' + (extra ? ', ' + translate(extra) : '') + ')';
                }],
                [/^(.+) 音色库已就绪 \((\d+) 个预设\)$/, function(m, name, n) {
                    return translate(name) + ' soundfont pronto (' + n + ' presets)';
                }],
                [/^(.+) 音色库已就绪 \((.+)\) \((\d+) 个预设\)$/, function(m, name, eng, n) {
                    return translate(name) + ' soundfont pronto (' + translate(eng) + ') (' + n + ' presets)';
                }],
                [/^正在下载 (.+)\.\.\.$/, function(m, name) { return 'Baixando ' + translate(name) + '...'; }],
                // 默认音轨名
                [/^音轨 (\d+)$/, 'Faixa $1'],
                // 错误消息 (前缀 + 内部消息递归翻译)
                [/^加载失败: (.+)$/, function(m, msg) { return 'Falha ao carregar: ' + translate(msg); }],
                [/^保存失败: (.+)$/, function(m, msg) { return 'Falha ao salvar: ' + translate(msg); }],
                [/^导出失败: (.+)$/, function(m, msg) { return 'Falha na exportação: ' + translate(msg); }],
                [/^MIDI 导入失败: (.+)$/, function(m, msg) { return 'Falha na importação MIDI: ' + translate(msg); }],
                [/^MIDI 粘贴失败: (.+)$/, function(m, msg) { return 'Falha ao colar MIDI: ' + translate(msg); }],
                [/^读取 MIDI 信息失败: (.+)$/, function(m, msg) { return 'Falha ao ler informações MIDI: ' + translate(msg); }],
                [/^错误: (.+)$/, function(m, msg) { return 'Erro: ' + translate(msg); }],
                [/^加载NBS文件失败: (.+)$/, function(m, msg) { return 'Falha ao carregar arquivo NBS: ' + translate(msg); }],
                [/^导出NBS失败: (.+)$/, function(m, msg) { return 'Falha na exportação NBS: ' + translate(msg); }],
                [/^导入MIDI失败: (.+)$/, function(m, msg) { return 'Falha na importação MIDI: ' + translate(msg); }],
                [/^读取MIDI信息失败: (.+)$/, function(m, msg) { return 'Falha ao ler informações MIDI: ' + translate(msg); }],
                [/^请求失败 \((\d+)\)$/, 'Falha na solicitação ($1)'],
                [/^请求失败: (.+)$/, function(m, msg) { return 'Falha na solicitação: ' + translate(msg); }],
                // 确认对话框与命名
                [/^将删除\s*(\d+)\s*个空轨 \(从\s*(\d+)\s*减到\s*(\d+)\)，是否继续？$/, 'Excluir $1 faixa(s) vazia(s) (de $2 para $3)? Continuar?'],
                [/^删除音轨 "(.+)" 及其所有 Clip\?$/, 'Excluir a faixa "$1" e todos os seus clipes?'],
                [/^(.+) \(副本\)$/, '$1 (cópia)'],
                [/^(.+) · (\d+) 音轨 · (\d+) 音符$/, '$1 · $2 faixa(s) · $3 nota(s)'],
                // ============ 运行时补充正则 1 (pt-BR) ============
                [/^已选择: (.+)$/, 'Selecionado: $1'], [/^乐器 (\d+)$/, 'Instrumento $1'],
                [/^乐器 #(\d+)(.*)$/, function(m, num, rest) {
                    var s = 'Instrumento #' + num;
                    if (rest) {
                        s += rest.replace(/\s*·\s*(立体声|单声道)\s*/g, function(mm, ch) { return ' · ' + translate(ch); })
                                .replace(/\s*·\s*基准\s*/g, ' · base ');
                    }
                    return s;
                }],
                [/^自定义音色 (\d+)$/, 'Instrumento personalizado $1'], [/^自定义音色 #(\d+)$/, 'Instrumento personalizado #$1'],
                [/^导入音色 (\d+)$/, 'Importar instrumento $1'], [/^(\d+) 轨道$/, '$1 faixa(s)'], [/^(\d+) 音符$/, '$1 nota(s)'],
                [/^通道 (\d+) · (\d+) 音符$/, 'Canal $1 · $2 nota(s)'], [/^鼓音符 (.+) · (.+)$/, 'Nota de bateria $1 · $2'],
                [/^(.+)\(通道(\d+)\)$/, function(m, name, ch) { return translate(name) + ' (canal ' + ch + ')'; }], [/^(.+) \(超出范围\)$/, function(m, name) { return translate(name) + ' (fora da extensão)'; }],
                [/^MIDI 文件格式损坏或数据不完整 \(轨道 (\d+)\)$/, 'Arquivo MIDI corrompido ou incompleto (faixa $1)'],
                [/^删除 Clip "(.+)"\?$/, 'Excluir o clipe "$1"?'], [/^\(槽位 (\d+)\)$/, '(slot $1)'],
                // 自定义音色导入/修正流程
                [/^来源文件: (.+) \(([\d.]+) MB\)$/, 'Arquivo de origem: $1 ($2 MB)'],
                [/^来源文件: (.+) \(([\d.]+) MB\) · 已按修正结果转换$/, 'Arquivo de origem: $1 ($2 MB) · convertido conforme correção'],
                [/^检测音高: (.+)$/, 'Altura detectada: $1'],
                [/^当前修正倍率 ×([\d.]+)。可点「试听」对比修正效果；满意后点下一步。$/, 'Fator de correção atual ×$1. Clique em "Prévia" para comparar; clique em Avançar quando estiver satisfeito.'],
                [/^播放修正后采样 · 倍率 ×([\d.]+) · 输出基准 (.+)$/, 'Reprodução da amostra corrigida · fator ×$1 · base de saída $2'],
                [/^已导入自定义音色「(.+)」，可在乐器选择中选用$/, 'Instrumento personalizado "$1" importado. Você pode selecioná-lo no seletor de instrumentos.'],
                [/^确定删除自定义音色「(.+)」吗？\n引用该音色的 NBS 文件中对应乐器将静音。$/, 'Excluir o instrumento personalizado "$1"?\nOs instrumentos que o referenciam em arquivos NBS ficarão sem som.'],
                // 消除重复音符
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = 'Nenhuma nota duplicada encontrada.\nCritério: mesmo tick + mesmo instrumento + mesma altura, ignorando a intensidade.';
                    if (k) s += '\n\nDica: ' + k + ' nota(s) têm o mesmo tick e altura, mas instrumentos diferentes';
                    if (i) s += '\nDica: ' + i + ' nota(s) têm o mesmo tick e instrumento, mas alturas diferentes';
                    if (t) s += '\nDica: ' + t + ' nota(s) têm o mesmo instrumento e altura, mas ticks diferentes';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, 'Excluir $1 nota(s) duplicada(s)? Continuar?'],
                [/^已删除 (\d+) 个重复音符$/, '$1 nota(s) duplicada(s) excluída(s)'],
                // 作品包 / 音色备份
                [/^作品包已导出，包含 (\d+) 个自定义音色音频。\n把 zip 分享给他人，导入后即可完整还原音色与歌曲。$/, 'Pacote de música exportado com $1 arquivo(s) de áudio de instrumentos personalizados.\nCompartilhe o zip; ao importá-lo, os instrumentos e a música são totalmente restaurados.'],
                [/^作品包导出失败: (.+)$/, function(m, msg) { return 'Falha ao exportar o pacote de música: ' + translate(msg); }], [/^NBS 打包失败: (.+)$/, function(m, msg) { return 'Falha ao empacotar NBS: ' + translate(msg); }],
                [/^已导出 (\d+) 个音色的备份。浏览器数据丢失后可随时导入恢复。$/, 'Backup de $1 instrumento(s) exportado. Você pode importá-lo a qualquer momento após perder os dados do navegador.'],
                [/^备份导出失败: (.+)$/, function(m, msg) { return 'Falha ao exportar o backup: ' + translate(msg); }],
                [/^已存在同名音色「(.+)」，但音频内容不同。\n\n请选择处理方式：$/, 'Já existe um instrumento chamado "$1", mas o áudio é diferente.\n\nEscolha como prosseguir:'],
                [/^音色备份导入完成（(\d+) 项）。$/, 'Backup de instrumentos importado ($1 item(ns)).'], [/^压缩包缺少 (.+)$/, 'O pacote está sem $1'],
                [/^无法识别的压缩包类型: (.+)$/, function(m, msg) { return 'Tipo de pacote não reconhecido: ' + translate(msg); }], [/^导入失败: (.+)$/, function(m, msg) { return 'Falha na importação: ' + translate(msg); }],
                [/^(.+) \(导入\)$/, '$1 (importado)'], [/^(.+) \(自定义音色\)$/, '$1 (instrumento personalizado)']
            ],
            'id-ID': [
                [/^音符:\s*(\d+)$/, 'Not: $1'], [/^位置:\s*(\d+)$/, 'Posisi: $1'],
                [/^录制到:\s*(.+)$/, 'Rekam ke: $1'], [/^已选择\s*(\d+)\s*个音符$/, '$1 not dipilih'],
                [/^已选择\s*(\d+)\s*个轨道$/, '$1 trek dipilih'], [/^长度\s*(\d+)\s*步\s*·\s*(\d+)\s*个音符$/, 'Panjang $1 langkah · $2 not'],
                [/^吸附到:\s*(.+)\s*\(每\s*(\d+)\s*tick\)$/, 'Kuantisasi ke: $1 (setiap $2 tick)'], [/^吸附网格:\s*(\d+)\s*tick$/, 'Kisi: $1 tick'],
                [/^已连接:\s*(.+)$/, 'Terhubung: $1'], [/^已连接\s+(.+)$/, 'Terhubung $1'], [/^MIDI 输入\s*(.+)$/, 'Input MIDI $1'],
                [/^预计\s*(.+)$/, 'Perkiraan $1'], [/^已处理\s*(\d+)\s*个音符。$/, '$1 not diproses.'],
                [/^当前只选中了\s*(\d+)\s*个音符。$/, 'Hanya $1 not yang dipilih.'],
                [/^已完成音域处理，调整了\s*(\d+)\s*个音符。$/, 'Pemrosesan rentang selesai. $1 not disesuaikan.'],
                [/^已处理\s*(\d+)\s*个音符，超出 Minecraft 标准音域的音符已按八度折叠。$/, '$1 not diproses. Not di luar rentang Minecraft dilipat per oktaf.'],
                [/^范围: (.+?) \((\d+) 个八度\)$/, 'Rentang: $1 ($2 oktaf)'],
                [/^通道 <b>(\d+)<\/b>$/, 'Kanal <b>$1</b>'],
                [/^已选择:\s*(\d+)\s*$/, 'Terpilih: $1'], [/^已选择:\s*(\d+)\s*个音符$/, 'Terpilih: $1 not'],
                // 音域处理模式提示 (整句)
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 不进行音域转换$/, 'Rentang Minecraft F#3-F#5 (MIDI 54-78) · Tanpa konversi rentang'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 超出音域的音符会按八度归一$/, 'Rentang Minecraft F#3-F#5 (MIDI 54-78) · Not di luar rentang dilipat per oktaf'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移、音色替代并强制归位$/, 'Rentang Minecraft F#3-F#5 (MIDI 54-78) · Geser otomatis, penggantian timbre, dan lipat paksa'],
                [/^MC 音域 F#3~F#5 \(MIDI 54~78\) · 自动偏移并按需使用音色替代$/, 'Rentang Minecraft F#3-F#5 (MIDI 54-78) · Geser otomatis dengan penggantian timbre sesuai kebutuhan'],
                // 音色库状态 (名称与引擎名也需翻译)
                [/^(.+) 已就绪 \((\d+) 个预设(?:, (.+))?\)$/, function(m, name, n, extra) {
                    return translate(name) + ' siap (' + n + ' preset' + (extra ? ', ' + translate(extra) : '') + ')';
                }],
                [/^(.+) 音色库已就绪 \((\d+) 个预设\)$/, function(m, name, n) {
                    return translate(name) + ' soundfont siap (' + n + ' preset)';
                }],
                [/^(.+) 音色库已就绪 \((.+)\) \((\d+) 个预设\)$/, function(m, name, eng, n) {
                    return translate(name) + ' soundfont siap (' + translate(eng) + ') (' + n + ' preset)';
                }],
                [/^正在下载 (.+)\.\.\.$/, function(m, name) { return 'Mengunduh ' + translate(name) + '...'; }],
                // 默认音轨名
                [/^音轨 (\d+)$/, 'Trek $1'],
                // 错误消息 (前缀 + 内部消息递归翻译)
                [/^加载失败: (.+)$/, function(m, msg) { return 'Gagal memuat: ' + translate(msg); }],
                [/^保存失败: (.+)$/, function(m, msg) { return 'Gagal menyimpan: ' + translate(msg); }],
                [/^导出失败: (.+)$/, function(m, msg) { return 'Gagal mengekspor: ' + translate(msg); }],
                [/^MIDI 导入失败: (.+)$/, function(m, msg) { return 'Gagal mengimpor MIDI: ' + translate(msg); }],
                [/^MIDI 粘贴失败: (.+)$/, function(m, msg) { return 'Gagal menempel MIDI: ' + translate(msg); }],
                [/^读取 MIDI 信息失败: (.+)$/, function(m, msg) { return 'Gagal membaca info MIDI: ' + translate(msg); }],
                [/^错误: (.+)$/, function(m, msg) { return 'Error: ' + translate(msg); }],
                [/^加载NBS文件失败: (.+)$/, function(m, msg) { return 'Gagal memuat berkas NBS: ' + translate(msg); }],
                [/^导出NBS失败: (.+)$/, function(m, msg) { return 'Gagal mengekspor NBS: ' + translate(msg); }],
                [/^导入MIDI失败: (.+)$/, function(m, msg) { return 'Gagal mengimpor MIDI: ' + translate(msg); }],
                [/^读取MIDI信息失败: (.+)$/, function(m, msg) { return 'Gagal membaca info MIDI: ' + translate(msg); }],
                [/^请求失败 \((\d+)\)$/, 'Permintaan gagal ($1)'],
                [/^请求失败: (.+)$/, function(m, msg) { return 'Permintaan gagal: ' + translate(msg); }],
                // 确认对话框与命名
                [/^将删除\s*(\d+)\s*个空轨 \(从\s*(\d+)\s*减到\s*(\d+)\)，是否继续？$/, 'Hapus $1 trek kosong (dari $2 menjadi $3)? Lanjutkan?'],
                [/^删除音轨 "(.+)" 及其所有 Clip\?$/, 'Hapus trek "$1" beserta semua Clip-nya?'],
                [/^(.+) \(副本\)$/, '$1 (salinan)'],
                [/^(.+) · (\d+) 音轨 · (\d+) 音符$/, '$1 · $2 trek · $3 not'],
                // ============ 运行时补充正则 1 (id-ID) ============
                [/^已选择: (.+)$/, 'Terpilih: $1'], [/^乐器 (\d+)$/, 'Instrumen $1'],
                [/^乐器 #(\d+)(.*)$/, function(m, num, rest) {
                    var s = 'Instrumen #' + num;
                    if (rest) {
                        s += rest.replace(/\s*·\s*(立体声|单声道)\s*/g, function(mm, ch) { return ' · ' + translate(ch); })
                                .replace(/\s*·\s*基准\s*/g, ' · dasar ');
                    }
                    return s;
                }],
                [/^自定义音色 (\d+)$/, 'Instrumen kustom $1'], [/^自定义音色 #(\d+)$/, 'Instrumen kustom #$1'],
                [/^导入音色 (\d+)$/, 'Impor instrumen $1'], [/^(\d+) 轨道$/, '$1 trek'], [/^(\d+) 音符$/, '$1 not'],
                [/^通道 (\d+) · (\d+) 音符$/, 'Kanal $1 · $2 not'], [/^鼓音符 (.+) · (.+)$/, 'Not drum $1 · $2'],
                [/^(.+)\(通道(\d+)\)$/, function(m, name, ch) { return translate(name) + ' (kanal ' + ch + ')'; }], [/^(.+) \(超出范围\)$/, function(m, name) { return translate(name) + ' (di luar rentang)'; }],
                [/^MIDI 文件格式损坏或数据不完整 \(轨道 (\d+)\)$/, 'Berkas MIDI rusak atau tidak lengkap (trek $1)'],
                [/^删除 Clip "(.+)"\?$/, 'Hapus klip "$1"?'], [/^\(槽位 (\d+)\)$/, '(slot $1)'],
                // 自定义音色导入/修正流程
                [/^来源文件: (.+) \(([\d.]+) MB\)$/, 'Berkas sumber: $1 ($2 MB)'],
                [/^来源文件: (.+) \(([\d.]+) MB\) · 已按修正结果转换$/, 'Berkas sumber: $1 ($2 MB) · dikonversi sesuai koreksi'],
                [/^检测音高: (.+)$/, 'Nada terdeteksi: $1'],
                [/^当前修正倍率 ×([\d.]+)。可点「试听」对比修正效果；满意后点下一步。$/, 'Faktor koreksi saat ini ×$1. Klik "Pratinjau" untuk membandingkan; klik Berikutnya jika sudah puas.'],
                [/^播放修正后采样 · 倍率 ×([\d.]+) · 输出基准 (.+)$/, 'Pemutaran sampel terkoreksi · faktor ×$1 · basis keluaran $2'],
                [/^已导入自定义音色「(.+)」，可在乐器选择中选用$/, 'Instrumen kustom "$1" diimpor. Anda dapat memilihnya di pemilih instrumen.'],
                [/^确定删除自定义音色「(.+)」吗？\n引用该音色的 NBS 文件中对应乐器将静音。$/, 'Hapus instrumen kustom "$1"?\nInstrumen yang merujuknya di berkas NBS akan senyap.'],
                // 消除重复音符
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = 'Tidak ada not duplikat yang ditemukan.\nKriteria: tick + instrumen + nada yang sama, mengabaikan kecepatan.';
                    if (k) s += '\n\nTips: ' + k + ' not memiliki tick dan nada sama tetapi instrumen berbeda';
                    if (i) s += '\nTips: ' + i + ' not memiliki tick dan instrumen sama tetapi nada berbeda';
                    if (t) s += '\nTips: ' + t + ' not memiliki instrumen dan nada sama tetapi tick berbeda';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, 'Hapus $1 not duplikat? Lanjutkan?'],
                [/^已删除 (\d+) 个重复音符$/, '$1 not duplikat dihapus'],
                // 作品包 / 音色备份
                [/^作品包已导出，包含 (\d+) 个自定义音色音频。\n把 zip 分享给他人，导入后即可完整还原音色与歌曲。$/, 'Paket lagu diekspor dengan $1 berkas audio instrumen kustom.\nBagikan zip-nya; setelah diimpor, instrumen dan lagu akan dipulihkan sepenuhnya.'],
                [/^作品包导出失败: (.+)$/, function(m, msg) { return 'Gagal mengekspor paket lagu: ' + translate(msg); }], [/^NBS 打包失败: (.+)$/, function(m, msg) { return 'Gagal mengemas NBS: ' + translate(msg); }],
                [/^已导出 (\d+) 个音色的备份。浏览器数据丢失后可随时导入恢复。$/, 'Backup $1 instrumen diekspor. Anda dapat mengimpornya kapan saja setelah data peramban hilang.'],
                [/^备份导出失败: (.+)$/, function(m, msg) { return 'Gagal mengekspor cadangan: ' + translate(msg); }],
                [/^已存在同名音色「(.+)」，但音频内容不同。\n\n请选择处理方式：$/, 'Instrumen bernama "$1" sudah ada, tetapi audio berbeda.\n\nPilih cara melanjutkan:'],
                [/^音色备份导入完成（(\d+) 项）。$/, 'Backup instrumen diimpor ($1 item).'], [/^压缩包缺少 (.+)$/, 'Paket kehilangan $1'],
                [/^无法识别的压缩包类型: (.+)$/, function(m, msg) { return 'Jenis paket tidak dikenal: ' + translate(msg); }], [/^导入失败: (.+)$/, function(m, msg) { return 'Gagal mengimpor: ' + translate(msg); }],
                [/^(.+) \(导入\)$/, '$1 (diimpor)'], [/^(.+) \(自定义音色\)$/, '$1 (instrumen kustom)']
            ],
            // 以下语言仅补充「消除重复音符」相关动态句, 其余动态句仍回退 en-US
            'es-ES': [
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = 'No se encontraron notas duplicadas.\nCriterio: mismo tick + mismo instrumento + misma altura, ignorando la velocidad.';
                    if (k) s += '\n\nSugerencia: ' + k + ' nota(s) comparten el mismo tick y altura pero distinto instrumento';
                    if (i) s += '\nSugerencia: ' + i + ' nota(s) comparten el mismo tick e instrumento pero distinta altura';
                    if (t) s += '\nSugerencia: ' + t + ' nota(s) comparten el mismo instrumento y altura pero distinto tick';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, '¿Eliminar $1 nota(s) duplicada(s)? ¿Continuar?'],
                [/^已删除 (\d+) 个重复音符$/, '$1 nota(s) duplicada(s) eliminada(s)']
            ],
            'ru-RU': [
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = 'Дубликаты нот не найдены.\nКритерий: тот же tick + тот же инструмент + та же высота, разница громкости игнорируется.';
                    if (k) s += '\n\nПодсказка: ' + k + ' нот(ы) имеют тот же tick и высоту, но другой инструмент';
                    if (i) s += '\nПодсказка: ' + i + ' нот(ы) имеют тот же tick и инструмент, но другую высоту';
                    if (t) s += '\nПодсказка: ' + t + ' нот(ы) имеют тот же инструмент и высоту, но другой tick';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, 'Удалить $1 дублирующихся нот? Продолжить?'],
                [/^已删除 (\d+) 个重复音符$/, '$1 дублирующихся нот удалено']
            ],
            'de-DE': [
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = 'Keine doppelten Noten gefunden.\nKriterium: gleicher Tick + gleiches Instrument + gleiche Tonhöhe, Lautstärke wird ignoriert.';
                    if (k) s += '\n\nHinweis: ' + k + ' Note(n) haben den gleichen Tick und dieselbe Tonhöhe, aber ein anderes Instrument';
                    if (i) s += '\nHinweis: ' + i + ' Note(n) haben den gleichen Tick und dasselbe Instrument, aber eine andere Tonhöhe';
                    if (t) s += '\nHinweis: ' + t + ' Note(n) haben dasselbe Instrument und dieselbe Tonhöhe, aber einen anderen Tick';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, '$1 doppelte Note(n) löschen? Fortfahren?'],
                [/^已删除 (\d+) 个重复音符$/, '$1 doppelte Note(n) gelöscht']
            ],
            'fr-FR': [
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = 'Aucune note en double trouvée.\nCritère : même tick + même instrument + même hauteur, la vélocité est ignorée.';
                    if (k) s += '\n\nAstuce : ' + k + ' note(s) partagent le même tick et la même hauteur mais un instrument différent';
                    if (i) s += '\nAstuce : ' + i + ' note(s) partagent le même tick et le même instrument mais une hauteur différente';
                    if (t) s += '\nAstuce : ' + t + ' note(s) partagent le même instrument et la même hauteur mais un tick différent';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, 'Supprimer $1 note(s) en double ? Continuer ?'],
                [/^已删除 (\d+) 个重复音符$/, '$1 note(s) en double supprimée(s)']
            ],
            'ko-KR': [
                [/^未发现重复音符。\n判定标准: 同一时间\(tick\) \+ 相同音色 \+ 相同音调，忽略音量差异。(?:\n\n提示: 有 (\d+) 个音符同一时间音调相同但音色不同 \(instrument 不同\))?(?:\n提示: 有 (\d+) 个音符同一时间音色相同但音调不同 \(key 不同\))?(?:\n提示: 有 (\d+) 个音符音色音调相同但时间不同 \(tick 不同\))?$/, function(m, k, i, t) {
                    var s = '중복 노트를 찾지 못했습니다.\n기준: 같은 tick + 같은 악기 + 같은 음높이, 음량 차이는 무시';
                    if (k) s += '\n\n힌트: ' + k + '개 노트가 같은 tick과 음높이지만 악기가 다릅니다';
                    if (i) s += '\n힌트: ' + i + '개 노트가 같은 tick과 악기지만 음높이가 다릅니다';
                    if (t) s += '\n힌트: ' + t + '개 노트가 같은 악기와 음높이지만 tick이 다릅니다';
                    return s;
                }],
                [/^将删除 (\d+) 个重复音符，是否继续？$/, '중복 노트 $1개를 삭제할까요? 계속하시겠습니까?'],
                [/^已删除 (\d+) 个重复音符$/, '중복 노트 $1개를 삭제했습니다']
            ]
        };
        var list = patterns[current] || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i][0].test(text)) return text.replace(list[i][0], list[i][1]);
        }
        // 兜底: 当前语言未覆盖的动态句回退到 en-US, 避免中文泄漏到非中文界面
        var fallback = patterns['en-US'] || [];
        for (var j = 0; j < fallback.length; j++) {
            if (fallback[j][0].test(text)) return text.replace(fallback[j][0], fallback[j][1]);
        }
        return text;
    }

    function translate(text) {
        // zh-CN 是源语言，键本身就是中文，不翻译
        if (current === 'zh-CN') return text;
        var dictionary = UI_TEXT[current] || {};
        // 本地词典缺失时回退到英文 (en-US), 避免中文泄漏到非中文界面
        return dictionary[text] || UI_TEXT['en-US'][text] || translatePattern(text);
    }

    function translateStaticText() {
        var dictionary = UI_TEXT[current] || {};
        var enDictionary = UI_TEXT['en-US'] || {};
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i], parent = node.parentElement;
            if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue;
            var currentValue = node.nodeValue;
            var entry = sourceText.get(node);
            if (!entry || (currentValue !== entry.source && currentValue !== entry.rendered)) {
                entry = { source: currentValue, rendered: currentValue };
                sourceText.set(node, entry);
            }
            var leading = (entry.source.match(/^\s*/) || [''])[0], trailing = (entry.source.match(/\s*$/) || [''])[0], value = entry.source.trim();
            // zh-CN 是源语言，不翻译；其他语言先查本地词典，再回退英文
            var translatedValue = (current === 'zh-CN') ? value : (dictionary[value] || enDictionary[value] || translatePattern(value));
            var rendered = leading + translatedValue + trailing;
            entry.rendered = rendered;
            if (node.nodeValue !== rendered) node.nodeValue = rendered;
        }
    }

    function translateAttributes() {
        var dictionary = UI_TEXT[current] || {};
        var enDictionary = UI_TEXT['en-US'] || {};
        var attributes = ['title', 'data-tip', 'placeholder', 'aria-label'];
        for (var a = 0; a < attributes.length; a++) {
            var attribute = attributes[a];
            var elements = document.querySelectorAll('[' + attribute + ']');
            for (var i = 0; i < elements.length; i++) {
                var element = elements[i];
                var dataKey = 'i18n' + attribute.charAt(0).toUpperCase() + attribute.slice(1).replace(/-([a-z])/g, function(_, letter) { return letter.toUpperCase(); });
                var renderedKey = dataKey + 'Rendered';
                var currentValue = element.getAttribute(attribute);
                var original = element.dataset[dataKey];
                var previousRendered = element.dataset[renderedKey];
                if (original === undefined || (currentValue !== original && currentValue !== previousRendered)) {
                    original = currentValue;
                    element.dataset[dataKey] = original;
                }
                var translated = (current === 'zh-CN') ? original : (dictionary[original] || enDictionary[original] || translatePattern(original));
                if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated);
                element.dataset[renderedKey] = translated;
            }
        }
    }

    function observeTranslations() {
        if (observeTranslations.observer) return;
        observeTranslations.observer = new MutationObserver(function(mutations) {
            var needsTextTranslation = false;
            var needsAttributeTranslation = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].type === 'attributes') {
                    needsAttributeTranslation = true;
                    continue;
                }
                if (mutations[i].type === 'characterData' || mutations[i].addedNodes.length) needsTextTranslation = true;
            }
            if (needsTextTranslation) translateStaticText();
            if (needsTextTranslation || needsAttributeTranslation) translateAttributes();
        });
        observeTranslations.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['title', 'data-tip', 'placeholder', 'aria-label']
        });
    }

    function setText(selector, value) { var element = document.querySelector(selector); if (element) element.textContent = value; }
    function setTitle(selector, value) { var element = document.querySelector(selector); if (element) element.title = value; }

    function apply(locale, persist) {
        current = normalize(locale) || 'en-US';
        document.documentElement.lang = current;
        document.title = t('page_title');
        translateStaticText();
        translateAttributes();
        setText('#settings-popup .settings-header h4', t('settings'));
        setText('#about-popup .settings-header h4', t('about') + ' NoteBlockWeb');
        setText('.privacy-popup-title', t('privacy_title'));
        setText('#privacy-popup-agree', t('agree'));
        setText('#privacy-popup-message', t('privacy_message'));
        setTitle('#btn-settings', t('settings'));
        setTitle('#btn-about', t('about'));
        setTitle('#btn-functions', t('functions'));
        setTitle('#btn-file', t('file'));
        setTitle('#btn-keyboard-piano', t('keyboard_piano'));
        setText('#midi-popup .settings-header h4', t('midi_import'));
        var settingLabel = document.querySelector('label[for="settings-language"]');
        if (settingLabel) settingLabel.textContent = t('language') + ':';
        var privacyLabel = document.querySelector('label[for="privacy-language"]');
        if (privacyLabel && privacyLabel.firstChild) privacyLabel.firstChild.nodeValue = t('language') + ' ';
        var selects = document.querySelectorAll('#settings-language, #privacy-language');
        for (var i = 0; i < selects.length; i++) selects[i].value = current;
        if (persist) try { localStorage.setItem(STORAGE_KEY, current); } catch (ignore) {}
        document.dispatchEvent(new CustomEvent('webnbs:languagechange', { detail: { locale: current } }));
    }

    function bindSelect(id) {
        var select = document.getElementById(id);
        if (!select || select.dataset.i18nBound) return;
        select.dataset.i18nBound = '1';
        select.addEventListener('change', function() { apply(this.value, true); });
    }

    function init() { bindSelect('settings-language'); bindSelect('privacy-language'); apply(detect(), false); observeTranslations(); }

    // ============ 运行时补充词条 (en-US) ============
    // 编辑器动态生成的 UI 文本。新增词条在 addLocale 之后追加,
    // 其他语言通过 translate() 的英文回退获得兜底, ja-JP 提供本地翻译。
    Object.assign(UI_TEXT['en-US'], {
        '一个格子多个音符': 'Multiple notes in one cell', '上一个音符的音调和音色': 'The pitch and timbre of the previous note',
        '下载': 'Download', '下载 MIDI 音色库': 'Download MIDI soundfont', '下载/解析失败, 将使用内置合成器': 'Download/parse failed; using built-in synthesizer',
        '例子 (1XXX2X3XXXXX1XX6):<br>': 'Example (1XXX2X3XXXXX1XX6):<br>', '例子 (留空长度 = 2)：<br>': 'Example (empty sustain = 2):<br>',
        '保存 NBS': 'Save NBS', '保存失败': 'Save failed', '保存失败:': 'Save failed:', '保存本地数据失败:': 'Failed to save local data:',
        '全部音符中筛选': 'Filter from all notes', '共享状态': 'Shared state', '关闭残留': 'Dismiss leftover', '击掌声': 'Click',
        '分': 'min', '刚关闭菜单': 'Menu just closed',
        '勾选要从当前选择中移除的音色': 'Check timbres to remove from the current selection',
        '填充的音符使用<b>上一个</b>原音符的音调和音色；最后一个音符会延长 4 个 tick 位置。': 'Filled notes use the <b>previous</b> note\'s pitch and timbre; the last note is extended by 4 ticks.',
        '处理失败': 'Processing failed', '处理完成': 'Processing complete', '存储空间不足, 部分数据可能未保存': 'Storage full; some data may not be saved',
        '导入失败': 'Import failed', '导出失败:': 'Export failed:', '将删除': 'Will be deleted', '已处理': 'Processed',
        '已完成音域处理，调整了': 'Range processing complete. Adjusted', '已恢复默认替代配置': 'Restored default substitution settings',
        '已清理': 'Cleaned up', '已连接': 'Connected', '已连接:': 'Connected:', '已选择': 'Selected', '已选择:': 'Selected:',
        '平移': 'Pan', '当前无选择, 将先全选再筛选。勾选要排除的音色': 'No selection; will select all first, then filter. Check timbres to exclude.',
        '当前没有可处理的音符。': 'There are no notes to process.',
        '当前编辑内容会被清空，是否新建空文件？': 'The current edits will be cleared. Create a new empty file?',
        '必须': 'Required', '恢复默认替代': 'Restore default substitution',
        '您有未保存的编辑内容，确定要离开吗？数据已自动保存到本地。': 'You have unsaved edits. Leave anyway? Data is auto-saved locally.',
        '打开菜单': 'Open menu', '操作失败': 'Operation failed', '放置音符': 'Place note',
        '文件数据不存在，可能已被清理': 'File data does not exist; it may have been cleaned up', '文件数据不完整': 'File data is incomplete',
        '无效': 'Invalid', '无法保存文件': 'Could not save file', '无法加载文件': 'Could not load file', '无法加载本地文件': 'Could not load local file',
        '无法导入 MIDI': 'Could not import MIDI', '无法导出文件': 'Could not export file', '无法解析': 'Could not parse',
        '无法试听：NBS 音频引擎未就绪。': 'Cannot preview: NBS audio engine is not ready.',
        '无法读取 MIDI 信息': 'Could not read MIDI info', '无法读取 MIDI 信息: 返回数据异常': 'Could not read MIDI info: invalid response',
        '无音符': 'No notes', '暂不': 'Not now', '未下载 (播放 MIDI 音符时按设置提示)': 'Not downloaded (prompt per settings when playing MIDI notes)',
        '未加载歌曲': 'No song loaded', '未命名': 'Untitled', '未知错误': 'Unknown error', '未选中有效音符': 'No valid note selected',
        '未配置 MIDI 音色库下载地址 (服务端 config.yaml)': 'MIDI soundfont URL is not configured (server config.yaml)',
        '本次导入中已提示过的通道': 'Channels already prompted in this import',
        '正在下载': 'Downloading', '正在处理...': 'Processing...', '正在解析...': 'Parsing...', '正在解析音色库...': 'Parsing soundfont...',
        '永远差一格/有偏差': 'Always off by one / off-pitch', '没有添加任何音符 (可能选中区间已满)': 'No notes were added (the selection may be full)',
        '浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听。': 'Web MIDI is unsupported and TinySynth is not loaded; cannot preview.',
        '浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。': 'Web MIDI is unsupported and TinySynth is not loaded; cannot preview the original timbre.',
        '清理孤儿文件失败:': 'Failed to clean up orphan files:', '清理自动保存数据后重试成功': 'Retry succeeded after cleaning auto-saved data',
        '清理配额失败:': 'Failed to clean up quota:', '清除音色库缓存': 'Clear soundfont cache',
        '确定清除已下载的 MIDI 音色库缓存吗？清除后需重新下载。': 'Clear the downloaded MIDI soundfont cache? You will need to download it again.',
        '确实选择了图片': 'Image is selected', '秒': 's', '自动': 'Automatic',
        '规律使用“|”分隔，数字代表相对于选择区域的第几条音轨。<br>': 'Use "|" to separate values; each number is the track position relative to the selection.<br>',
        '规律格式错误，请使用“|”分隔正整数，例如 1|2|1|3。': 'Invalid pattern. Use "|" to separate positive integers, e.g. 1|2|1|3.',
        '解析返回空数据': 'Parse returned empty data', '试听失败': 'Preview failed', '试听此轨道': 'Preview this track', '该轨道没有音符事件': 'This track has no note events',
        '请先在钢琴卷帘上选择至少 1 个音符再使用上下起伏。': 'Select at least 1 note in the piano roll before using Arpeggio motion.',
        '请先在钢琴卷帘上选择至少 1 个音符再使用清除延音。': 'Select at least 1 note in the piano roll before clearing sustain.',
        '请先选择要偏移的音符': 'Select the notes to shift first', '请先选择音符': 'Select notes first',
        '请选择多个音符 (至少 2 个)。\n\n当前只选中了 1 个音符。': 'Select multiple notes (at least 2).\n\nOnly 1 note is currently selected.',
        '读取 MIDI 信息失败:': 'Failed to read MIDI info:', '配额超限, 已清理': 'Quota exceeded; cleaned up',
        '错误:': 'Error:', '间隔': 'Interval', '音色替代配置已保存': 'Substitution settings saved',
        '音色替代配置已恢复为默认。': 'Substitution settings restored to defaults.', '音频上下文未就绪，无法试听。': 'Audio context is not ready; cannot preview.',
        '预计': 'Estimated', '鼓': 'Drums', '鼓音符': 'Drum note', '鼠标放在哪格, 松手就落在哪格': 'The note lands on the cell where you release'
    });

    // ============ 运行时补充词条 2 (en-US) ============
    // 新增功能 (MIDI 音色库/音色替代/音域处理) 的错误消息与弹窗文本。
    // 多数为拼接文本, 由 translatePattern 处理; 这里的完整片段供
    // translateStaticText 的文本节点直接命中。
    Object.assign(UI_TEXT['en-US'], {
        '请求失败': 'Request failed', '网络错误': 'Network error', '请求超时': 'Request timeout',
        '文件损坏': 'Corrupted file', '磁盘已满': 'Disk is full', '编码错误': 'Encoding error',
        '播放失败': 'Playback failed', '暂停失败': 'Pause failed', '停止失败': 'Stop failed',
        '读取文件失败': 'Failed to read file', '添加音符失败': 'Failed to add note', '更新音符失败': 'Failed to update note',
        '删除音符失败': 'Failed to delete note', '批量操作失败': 'Batch operation failed', '设置速度失败': 'Failed to set tempo',
        '加载NBS文件失败:': 'Failed to load NBS file:', '导出NBS失败:': 'NBS export failed:', '导入MIDI失败:': 'MIDI import failed:',
        '读取MIDI信息失败:': 'Failed to read MIDI info:',
        'NBS: 意外的文件结束': 'NBS: unexpected end of file', 'MIDI: 意外的文件结束': 'MIDI: unexpected end of file',
        'NBS: 字符串超出文件范围': 'NBS: string out of file range',
        '无效的 MIDI 文件：缺少 MThd 头': 'Invalid MIDI file: missing MThd header',
        'MIDI 文件格式损坏或数据不完整 (轨道': 'MIDI file corrupted or incomplete (track',
        '缺少 sdta 块': 'Missing sdta chunk', '缺少 pdta 块': 'Missing pdta chunk',
        '不是 RIFF 文件': 'Not a RIFF file', '不是 SoundFont 文件 (form=': 'Not a SoundFont file (form=',
        'AudioContext 不可用': 'AudioContext unavailable',
        'MIDI 音色库': 'MIDI soundfont', '内置解析器': 'Built-in parser',
        '音色覆盖提示': 'Timbre override notice',
        '当前使用拟合音色。你手动选择了具体乐器后，': 'currently uses the fitted timbre. Once you manually pick a specific instrument, ',
        '该通道将不再跟随拟合结果改变': 'this channel will no longer follow the fitting result',
        '，即后续在"音色拟合"标签页中调整的组合音色不会应用到这个通道。': ', and timbre combinations adjusted in the "Timbre fitting" tab will not be applied to this channel.',
        '归一化': 'Normalized', '无偏移': 'No shift',
        '• 间隔 0：': '• Gap 0: ', '• 间隔 1：': '• Gap 1: ', '• 间隔 2：': '• Gap 2: ',
        '(无空位)': '(no gap)',
        '(超出范围)': '(out of range)', '+ 添加音轨': '+ Add track',
        '用“|”分隔正整数，如 1|2|1|3': 'Use "|" to separate positive integers, e.g. 1|2|1|3',
        '及其所有 Clip?': 'and all its clips?'
    });

    // ============ 运行时补充词条 3 (en-US) ============
    // 新增功能 (创作辅助/音频导出/自定义音色/消除重复音符/作品包备份) 的静态文案。
    // 动态拼接语句由 translatePattern 整串匹配, 这里提供整句/整块静态命中,
    // 其他语言经 translate() 的英文回退获得兜底。
    Object.assign(UI_TEXT['en-US'], {
        // 创作辅助面板
        '创作辅助': 'Creation helper', '默认工具': 'Default tool', '选择工具': 'Select tool', '橡皮擦': 'Eraser', '画笔': 'Brush', '工具': 'Tool', '下一个': 'Next',
        '普通放置': 'Normal placement', '延音放置': 'Sustain placement', '音符音量': 'Note velocity', '预览显示': 'Preview display',
        '延音长度 N': 'Sustain length N', '覆盖逻辑': 'Overwrite logic', '直接覆盖': 'Overwrite directly', '缩小长度': 'Shrink length',
        '禁止覆盖': 'Never overwrite', '留空长度 K': 'Empty length K', '是否淡出': 'Fade out', '最小音量': 'Min velocity',
        '淡出样式': 'Fade style', '线性': 'Linear', '缓入': 'Ease in', '缓出': 'Ease out', '二次缓入': 'Quadratic ease in', '二次缓出': 'Quadratic ease out',
        '区域清除': 'Area clear', '连续清除': 'Continuous clear', '清除半径 R': 'Clear radius R', '区域形状': 'Area shape', '圆形': 'Circle', '正方形': 'Square',
        '同类判定 (AND)': 'Same-category match (AND)', '数量限制': 'Count limit', '该工具暂无创作辅助功能': 'No creation-helper options for this tool',
        // 查找/替换
        '查找音符 (Ctrl+F)': 'Find notes (Ctrl+F)', '查找音符': 'Find notes', '查找': 'Find', '替换': 'Replace', '单个': 'Single', '范围': 'Range', '数值': 'Value',
        '清空条件 (匹配全部)': 'Clear conditions (match all)', '全部选择': 'Select all', '替换为': 'Replace with', '替换当前': 'Replace current', '全部替换': 'Replace all',
        '不限': 'No limit', '不变': 'Unchanged',
        // 音频导出弹窗
        '导出为音频': 'Export as audio', '格式': 'Format', '码率': 'Bitrate', '风格': 'Style',
        '同步应用到实时播放（可在主界面 ▶ 播放试听效果）': 'Apply to live playback (press ▶ in the main view to audition)',
        '准备渲染…': 'Preparing to render…', '开始渲染…': 'Rendering…', '渲染完成': 'Render complete', '渲染中…': 'Rendering…', '编码 MP3…': 'Encoding MP3…',
        'MP3 编码库未加载': 'MP3 encoder library not loaded', '渲染并导出音频': 'Render and export audio',
        '音频已导出：': 'Audio exported:', '导出完成': 'Export complete', '音频导出失败：': 'Audio export failed:', '音频导出': 'Export audio',
        // 音效风格预设
        '原声': 'Original', '演唱会': 'Concert', '大厅': 'Hall', '俱乐部': 'Club', '摇滚': 'Rock', '复古': 'Retro', '纯净': 'Clean',
        '无任何处理, 最接近 NBS 原始输出': 'No processing; closest to the raw NBS output',
        '中频增强 + 轻房间混响 + 轻压缩, 伴奏欢唱感': 'Mid boost + light room reverb + light compression, sing-along feel',
        '大厅/现场感混响 + 压缩靠前, 现场 PA 感': 'Hall/live reverb with upfront compression, PA feel',
        '古典大空间混响, 柔和, 高频略收': 'Classic large-space reverb, soft, slightly rolled-off highs',
        '低频增强 + 偏干 + 短混响, 节奏清晰': 'Bass boost + dry + short reverb, rhythmic clarity',
        '中频提升 + 结实压缩, 乐队感': 'Mid lift + punchy compression, band feel',
        '温和高频衰减 + 轻度饱和, 磁带感': 'Gentle high-end roll-off + light saturation, tape feel',
        '平直 EQ + 轻压缩提升清晰度': 'Flat EQ + light compression for clarity',
        // 自定义音色
        '自定义音色': 'Custom instrument', '导入音色': 'Import instrument', '导出音色备份': 'Export instrument backup', '导入音色备份': 'Import instrument backup',
        '把一段音频（如某个乐器/人声/音效采样）变成一个可演奏音色': 'Turn an audio clip (an instrument, voice or SFX sample) into a playable instrument',
        '还没有自定义音色。点击「导入音色」添加第一个吧。': 'No custom instruments yet. Click "Import instrument" to add your first.',
        '无法创建音频上下文': 'Could not create the audio context', '无法创建 AudioContext': 'Could not create an AudioContext',
        '无法解码该音频文件，请尝试 mp3/wav/ogg 等格式': 'Could not decode this audio file. Try mp3/wav/ogg.',
        '无法解码该音频文件，请尝试其它格式': 'Could not decode this audio file. Try another format.',
        '正在检测音高…': 'Detecting pitch…', '音频修正': 'Pitch correction', '请输入名称': 'Enter a name',
        '该名称已存在（不能与内置及已有自定义音色重复）': 'This name already exists (cannot collide with built-in or existing custom instruments)',
        '保存失败，请重试': 'Save failed. Please retry.', '输入新的音色名称:': 'Enter a new instrument name:', '音色名称': 'Instrument name',
        '该名称已存在，请换一个': 'This name already exists. Choose another.', '删除音色': 'Delete instrument',
        '半音': 'Semitones', '音分': 'Cents', '修正后基准:': 'Corrected base:', '以 F#3 为参照, 音频原样(1x)播放时的音高': 'Pitch of the raw (1x) sample, referenced to F#3',
        '自动调整': 'Auto-tune', '重新检测': 'Re-detect', '拖动滑块或点「自动调整」修正音准, 拖动后自动试听修正结果': 'Drag the slider or click "Auto-tune" to fix the pitch; the result previews automatically',
        '实时监视: 播放时显示波形与频率': 'Live monitor: shows waveform and frequency while playing',
        '下一步: 设置音色信息': 'Next: configure instrument info', '设置音色信息': 'Configure instrument info', '图标颜色': 'Icon color',
        '基准音高': 'Base pitch', '音频原样播放对应的音高': 'Pitch of the raw playback', '试听(低7)': 'Preview (low 7)', '试听(高7)': 'Preview (high 7)',
        '‹ 上一步': '‹ Back', '完成': 'Done', '输入音色名称': 'Enter an instrument name', '低 7 个半音试听': 'Preview 7 semitones lower', '高 7 个半音试听': 'Preview 7 semitones higher',
        '■ 停止': '■ Stop', '▶ 试听': '▶ Preview', '立体声': 'Stereo', '单声道': 'Mono',
        '更换颜色': 'Change color', '试听 MIDI 原音': 'Preview original MIDI timbre', '试听 NBS 组合音': 'Preview NBS layering',
        '点击选择高音替代音色': 'Click to choose a substitute for high notes', '点击选择低音替代音色': 'Click to choose a substitute for low notes',
        // 消除重复音符
        '消除重复音符': 'Remove duplicate notes', '没有可去重的音符': 'No notes to deduplicate',
        '重排序音符': 'Reorder notes',
        '合并并消除伪延音': 'Merge and remove pseudo-sustain',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': 'Merges closely spaced repeated notes into a sustained note and removes the extras. When off, all cross-bar relations are ignored and each time point is processed independently (recommended off; enabling may severely degrade quality).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'This switch is saved per engine and currently affects only the selected engine.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': 'After removing duplicates, isolated consecutive notes in the track below move up to fill the gaps',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': 'Removes notes with the same tick, instrument and pitch; enable "Reorder notes" to move isolated consecutive notes up and fill the gaps',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': 'No duplicate notes found.\nCriterion: same tick, same instrument and same pitch, ignoring velocity.',
        // 歌曲压缩
        '歌曲压缩': 'Song compression', '压缩等级': 'Compression level', '算法模型': 'Algorithm model',
        '近乎无损': 'Near-lossless', '高质量': 'High quality', '中等质量': 'Medium quality', '较低质量': 'Lower quality', '最低质量': 'Lowest quality',
        '压缩方式': 'Compression mode', '仅删除重复音符': 'Remove duplicates only', '使用压缩算法': 'Use compression algorithm',
        '轻度压缩': 'Light compression', '中度压缩': 'Medium compression', '较强压缩': 'Strong compression', '最强压缩': 'Maximum compression',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': 'Removes only notes that are exact duplicates at the same tick, instrument and pitch; quality is almost unaffected.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': 'Beyond deduplication, removes low-presence notes according to the compression level for a higher compression ratio.',
        '只删除完全重复的音符，几乎不影响质量。': 'Removes only exact duplicate notes; quality is almost unaffected.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': 'Removes low-presence notes at the selected compression level; the ratio rises and quality loss grows with the level.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': 'Maximum compression: notes may be over-removed and the song may sound noticeably degraded',
        '务实启发式（快速）': 'Pragmatic heuristic (fast)', '感知引擎（智能）': 'Perceptual engine (smart)',
        '压缩': 'Compress', '歌曲太短，无法压缩': 'Song too short to compress', '未删除任何音符': 'No notes removed',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': 'Lowest quality: notes may be over-deleted and the song may sound noticeably degraded',
        '预计删除': 'Estimated removal', '保留': 'Kept',
        '正在计算…': 'Calculating…', '正在压缩': 'Compressing',
        '减轻处理的轨道': 'Tracks with lighter processing', '不被处理的轨道': 'Tracks excluded from processing',
        '选择': 'Select', '未选择任何轨道': 'No tracks selected',
        '选择减轻处理的轨道': 'Select tracks for lighter processing',
        '选择不被处理的轨道': 'Select tracks excluded from processing',
        '在画布中点击音轨行进行选择/取消，可多选。': 'Click track rows on the canvas to select or deselect. Multi-select is supported.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': 'The three models keep different notes; the presence engine judges by physical audibility, closest to what actually sounds.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': 'Pragmatic heuristic (fast): quick rule-based scoring (root/third/fifth, octave duplicates, beat, velocity, duration) — fast and stable.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': 'Perceptual engine (smart): scores by voice role, beat, duration, velocity, masking and percussion density — closer to perceived quality, slightly slower.',
        '存在感引擎（物理）': 'Presence engine (physical)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': 'Presence engine (physical): removes notes by their actual audibility in the rendered audio (energy summation, masking field, audible margin) — no tonality dependence, predictable results.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': 'The presence engine removes notes by physical audibility, making it the closest to what actually sounds — stable even on chaotic/atonal input.',
        // 导出 NBS 弹窗
        '标准 .nbs 只保存音色引用（不含音频），在其它设备/播放器上这些音色会静音。': 'A standard .nbs file stores only instrument references (no audio), so those instruments will be silent on other devices/players.',
        '导出自定义音色作品包 (zip)：歌曲 + 使用到的音色音频一起打包，完整携带音色': 'Export custom instrument pack (zip): the song and the instrument audio it uses are packed together for full portability',
        // 作品包 / 音色备份
        '作品包': 'Song pack', '打包作品包…': 'Packing the song pack…',
        'ZIP 打包库未加载，暂时无法导出作品包。请刷新页面重试。': 'ZIP library not loaded; cannot export the song pack. Refresh the page and retry.',
        '当前没有自定义音色可备份。': 'No custom instruments to back up.', '音色备份': 'Instrument backup',
        'ZIP 打包库未加载，暂时无法导出备份。请刷新页面重试。': 'ZIP library not loaded; cannot export the backup. Refresh the page and retry.',
        '备份完成': 'Backup complete', '备份失败': 'Backup failed', '同名音色冲突': 'Name conflict',
        '「替换」会用新音频覆盖本地同名音色；「重命名」则作为新音色导入。': '"Replace" overwrites the local instrument with the new audio; "Rename" imports it as a new instrument.',
        '重命名导入': 'Rename and import', '替换现有音色': 'Replace existing instrument', '新名称': 'New name',
        '导入备份': 'Import backup', '导入作品包': 'Import song pack',
        '作品包导入完成，自定义音色已装载并重映射。': 'Song pack imported; custom instruments loaded and remapped.',
        '作品包导入完成，歌曲已载入。': 'Song pack imported; the song has been loaded.',
        '无法识别的压缩包类型': 'Unrecognized archive type', '缺少 metadata.json，不是有效的作品包/备份文件': 'Missing metadata.json; not a valid song pack/backup file',
        'metadata.json 解析失败': 'Failed to parse metadata.json', '解析压缩包…': 'Parsing the archive…',
        'ZIP 解析库未加载，无法导入 zip 文件。请刷新页面重试。': 'ZIP library not loaded; cannot import zip files. Refresh the page and retry.',
        '缺少自定义音色': 'Missing custom instruments', '— 请选择替换音色 —': '— Choose a replacement instrument —',
        '跳过（该音色静音）': 'Skip (instrument stays silent)',
        '「替换」会把歌曲中该音色的音符改用到所选音色；「跳过」则让这些音符静音（仍保留在歌曲中）。': '"Replace" reassigns notes of that instrument to the chosen one; "Skip" leaves them silent (notes stay in the song).',
        '替换并加载': 'Replace and load', '稍后导入': 'Import later',
        '把全部自定义音色打包为 zip 备份，浏览器数据丢失后可通过「导入音色备份」恢复': 'Pack all custom instruments into a zip backup; after browser data loss, restore them via "Import instrument backup"',
        '从备份 zip 恢复自定义音色（同名同内容自动跳过，重名异内容会提示处理）': 'Restore custom instruments from a backup zip (same name and content are skipped; same name with different content prompts for action)',
        // 其他
        '解析响应失败': 'Failed to parse the response', '删除 Clip': 'Delete clip', '重命名 Clip': 'Rename clip', 'Clip 名称:': 'Clip name:',
        '新音轨名称:': 'New track name:', '添加音轨': 'Add track',
        // 音频修正/导入剩余静态句
        '未能检测到稳定音高（可能非单音或过短）。可手动用下方滑块设定，或换一段更清晰的单音采样。': 'No stable pitch detected (may be non-monophonic or too short). Set it manually with the slider below, or use a cleaner monophonic sample.',
        '变速渲染失败，请重试': 'Pitch-shift rendering failed. Please retry.',
        '请输入一个新的名称：': 'Enter a new name:'
    });

    // ============ ja-JP 完整本地化 ============
    // ja-JP 通过 addLocale 只覆盖了少量词条, 其余继承英文。这里为全部
    // 中文键提供日语翻译, 使日语界面不显示英文/中文。
    Object.assign(UI_TEXT['ja-JP'], {
        '文件': 'ファイル', '速度': 'テンポ', '撤销': '元に戻す', '重做': 'やり直す', '设置': '設定', '关于': '情報', '功能': 'ツール',
        '撤销 (Ctrl+Z)': '元に戻す (Ctrl+Z)', '重做 (Ctrl+Y)': 'やり直す (Ctrl+Y)', '速度 (Tick/秒)': 'テンポ (tick/秒)',
        '更多': 'その他', '钢琴键盘': 'ピアノ鍵盤', '使用键盘触发钢琴': 'キーボードでピアノを鳴らす', '折叠音轨列表': 'トラック一覧を折りたたむ',
        '默认工具 (D)': '標準ツール (D)', '选择工具 (S)': '選択ツール (S)', '橡皮擦 (E)': '消しゴム (E)', '画笔 (B)': 'ブラシ (B)', '演奏模式 (P)': '演奏モード (P)',
        '播放/暂停 (Space)': '再生/一時停止 (Space)', '开始录制 (Space)': '録音を開始 (Space)', '停止 (Esc)': '停止 (Esc)', '选择乐器': '楽器を選択',
        '缩放精度': 'グリッド精度', '音调偏移': '音程シフト', '延音填充': 'サステインを補完', '清除延音': 'サステインを削除', '上下起伏': 'アルペジオの動き',
        '转8度内': '2 オクターブ内に収める', '音域处理': '音域を処理', '清除空轨道': '空のトラックを削除', '新建文件': '新規ファイル', '打开文件': 'ファイルを開く',
        '保存': '保存', '导出 NBS': 'NBS をエクスポート', '取消': 'キャンセル', '导入': 'インポート', '基本设置': '基本設定', '音轨': 'トラック', '音色拟合': '音色フィッティング',
        '读取音符力度': 'ノートベロシティを読み取る', '音符吸附': 'ノートスナップ', '歌曲精度:': '曲の精度:', '拍子:': '拍:', '延音处理:': 'サステイン:', '移除无音符轨道': '空のトラックを削除',
        '全选': 'すべて選択', '取消选择': '選択解除', '复制': 'コピー', '剪切': '切り取り', '粘贴': '貼り付け', '删除': '削除', '更改乐器': '楽器を変更', '更改音量': '音量を変更',
        '静音': 'ミュート', '取消静音': 'ミュート解除', '独奏': 'ソロ', '取消独奏': 'ソロ解除', '删除音轨': 'トラックを削除', '上移轨道': 'トラックを上へ', '下移轨道': 'トラックを下へ', '音量:': '音量:',
        '历史文件': '履歴', '暂无历史文件': '保存済みファイルはありません', '更多...': 'その他...', '加载': '読み込み', '重命名': '名前を変更', '关闭': '閉じる',
        '展开/折叠钢琴键盘': 'ピアノ鍵盤の表示/非表示', '设置小键盘弹奏音域': 'テンキー演奏音域の設定', '超出范围': '範囲外', '音符:': '音符:', '位置:': '位置:',
        '平滑翻页 (播放头居中)': 'スムーズ追従 (再生ヘッド中央)', '音符播放高亮动画': 'ノート再生ハイライト', '录制时显示音符动画 (关闭可提升录制性能)': '録音中にノートアニメを表示 (オフで録音性能向上)',
        '音效优化 (混响/立体声)': 'オーディオ強化 (リバーブ/ステレオ)', 'NBS 导出版本:': 'NBS エクスポート版:', '含铜号角乐器时自动 V6': '銅の角笛があるとき自動で V6 に',
        '关于 NoteBlockWeb': 'NoteBlockWeb について', '调节速度': 'テンポを調整', '基于 Web 的 Minecraft 音符盒编辑器': 'Web ベースの Minecraft 音符ブロックエディター',
        '支持 NBS 格式导入/导出, MIDI 导入, 钢琴卷帘编辑': 'NBS のインポート/エクスポート、MIDI インポート、ピアノロール編集に対応', '版本:': 'バージョン:', '开发者:': '開発者:', '反馈邮箱:': 'フィードバック:',
        '演奏模式设置': '演奏モード設定', '节拍器:': 'メトロノーム:', '启用': '有効', '延音录制': 'サステイン録音', '外部 MIDI 设备输入': '外部 MIDI デバイス入力', '未连接': '未接続',
        '开始演奏': '演奏を開始', '文件:': 'ファイル:', '类型:': 'タイプ:', '时长:': '長さ:', '轨道:': 'トラック:', '通道映射': 'チャンネルマッピング',
        '打击乐': '打楽器', '通道': 'チャンネル', '音色': '音色', 'NBS 乐器': 'NBS 楽器', '偏移前音域': 'シフト前の音域', '偏移后音域': 'シフト後の音域',
        '八度': 'オクターブ', '音调': '音程', '试听': '試聴', '名称': '名前', '事件': 'イベント', '预览': 'プレビュー', '旋律': 'メロディ', '乐器': '楽器',
        'MIDI 音符': 'MIDI ノート', 'NBS 音高': 'NBS 音高', '音色槽 1': '音色スロット 1', '音色槽 2': '音色スロット 2', '音色槽 3': '音色スロット 3',
        '移除无音符轨道': 'ノートのないトラックを削除', '自动命名轨道': 'トラック名を自動付与', '命名依据:': '命名基準:', '通道号': 'チャンネル番号', '音色名': '音色名',
        '导入速度变化事件': 'テンポ変化をインポート', '音域处理:': '音域処理:', '不启用': '無効', '单独音符归一法': '音符ごとの正規化',
        '整体八度偏移法': 'トラック全体のオクターブ移動', '整体音调偏移法': 'トラック全体の半音移動', '优先大调': '長調を優先', '优先小调': '短調を優先',
        '启用智能音色替代': 'スマート音色置換を有効にする', '启用溢出强制归位 (Fallback)': 'はみ出しの強制折り返し (フォールバック)', '音色替代': '音色置換',
        '选择轨道': 'トラックを選択', '记住以上设置': '設定を記憶', '音色替代设置': '音色置換設定', '应用音轨': 'トラックに適用',
        '音色替代配置': '置換設定', '高音替代': '高音の代替', '低音替代': '低音の代替', '恢复默认': '初期設定に戻す', '应用': '適用',
        '竖琴': 'ハープ', '低音提琴': 'コントラバス', '大鼓': 'バスドラム', '小鼓': 'スネアドラム', '击打声': 'クリック', '吉他': 'ギター', '长笛': 'フルート', '钟琴': 'ベル',
        '风铃': 'チャイム', '木琴': 'シロフォン', '铁木琴': '鉄のシロフォン', '牛铃': 'カウベル', '迪吉里杜管': 'ディジュリドゥ', '芯片音': 'ビット', '班卓琴': 'バンジョー',
        '电钢琴': 'プリング', '铜号角': '銅の角笛', '斑驳的铜号角': '風化していない銅の角笛', '锈蚀的铜号角': '風化した銅の角笛', '氧化的铜号角': '酸化した銅の角笛', '无': 'なし',
        '提示': '通知', '确认': '確認', '输入': '入力', '确定': 'OK', '导出': 'エクスポート', '文件名:': 'ファイル名:', '请输入文件名': 'ファイル名を入力してください',
        '作者和介绍 (可选)': '作者と紹介 (任意)', '作者:': '作者:', '作者名 (可选)': '作者名 (任意)', '介绍:': '紹介:', '歌曲介绍 (可选)': '曲の紹介 (任意)',
        '点击重命名音轨': 'トラック名を変更', '选择这一轨的全部音符': 'このトラックの全ノートを選択', '拖动调整音轨顺序': 'ドラッグでトラック順を変更', '删除这一条音轨': 'このトラックを削除',
        '设置音量': '音量を設定', '静音这一条音轨': 'このトラックをミュート', '只试听这一条音轨': 'このトラックのみソロ試聴', '添加新音轨': 'トラックを追加', '更多音轨操作': 'その他のトラック操作',
        '展开音轨信息栏': 'トラックパネルを展開', '折叠音轨信息栏': 'トラックパネルを折りたたむ',
        '弹奏音域设置': '演奏音域の設定', '字母键盘': '文字キーボード', '小键盘': 'テンキー', '八度偏移': 'オクターブシフト', '半音偏移': '半音シフト', '重置': 'リセット',
        '修改音量': '音量を変更', '输入音量 (0-100):': '音量を入力 (0-100):', '删除轨道': 'トラックを削除', '上移轨道': 'トラックを上へ', '下移轨道': 'トラックを下へ',
        '请在画布中点击选择要录制的音轨': 'キャンバスで録音するトラック行をクリックして選択してください', '请先在画布中点击选择要录制的音轨！': '録音前にキャンバスでトラック行を選択してください。',
        '浏览器不支持 MIDI 设备': 'このブラウザは MIDI デバイスをサポートしていません', 'MIDI 设备访问被拒绝': 'MIDI デバイスへのアクセスが拒否されました', '未检测到 MIDI 设备': 'MIDI デバイスが見つかりません',
        '停止录制': '録音を停止', '开始演奏录制': '演奏録音を開始', '播放/暂停试听': '試聴を再生/一時停止', '平滑翻页: 开启': 'スムーズ追従: オン', '平滑翻页: 关闭': 'スムーズ追従: オフ',
        '缩放精度': 'グリッド精度', '将所有音符的时间位置 (tick) 按比例缩放：': '全ノートの時間位置 (tick) を比率で拡大縮小:', '选择缩放倍数：': '倍率を選択:',
        '音符吸附': 'ノートスナップ', '将音符吸附到最近的网格线上。': 'ノートを最寄りのグリッド線にスナップします。', '选择范围：': '範囲を選択:', '全部音符': '全ノート', '当前轨道': '現在のトラック', '选中音符': '選択中のノート', '选择拍子：': '拍を選択:',
        '音调偏移': '音程シフト', '偏移方式:': 'シフト方式:', '按音调': '半音', '按八度': 'オクターブ', '偏移量:': 'シフト量:', '正=向上, 负=向下': '正 = 上へ, 負 = 下へ',
        '延音填充': 'サステインを補完', '清除延音': 'サステインを削除', '上下起伏': 'アルペジオの動き', '转8度内': '2 オクターブ内に収める',
        '当前没有音符，无法缩放': '拡大縮小するノートがありません', '当前没有音符': 'ノートがありません', '没有选中任何音符': 'ノートが選択されていません', '没有需要吸附的音符': 'スナップするノートがありません',
        '没有空轨可清除': '削除する空トラックがありません', '清除空轨': '空トラックを削除', '至少保留一条音轨。': '少なくとも 1 本のトラックを残してください。',
        '未检测到旋律通道': 'メロディチャンネルが見つかりません', '未检测到打击乐音符': '打楽器ノートが見つかりません', '暂无 MIDI 音轨数据': 'MIDI トラックデータがありません',
        '加载': '読み込み', '保存成功': '保存しました', '警告': '警告', '保存': '保存', '加载失败': '読み込みに失敗', '导出失败': 'エクスポートに失敗', '没有可导出的歌曲': 'エクスポートできる曲がありません',
        '演奏模式': '演奏モード', '关闭': '閉じる', '知道了': '了解', '应用': '適用',
        '音轨': 'トラック', '名称': '名前', '乐器': '楽器', '音量': '音量', '声像': 'パン', '混响': 'リバーブ', '淡入': 'フェードイン', '淡出': 'フェードアウト',
        '打开钢琴卷帘': 'ピアノロールを開く', '复制片段': 'クリップを複製', '删除片段': 'クリップを削除', '回到开头': '先頭に戻る', '菜单': 'メニュー',
        '音符超出范围': '範囲外のノート', '部分音符超出了 Minecraft 标准音域 (F#3 ~ F#5):': '一部のノートが Minecraft 標準音域 (F#3~F#5) を超えています:',
        '超出范围的音符在 Minecraft 中播放可能音色异常。你可以在"功能"菜单中使用"转8度内"修正。': '範囲外のノートは Minecraft で音色が異常になる可能性があります。「ツール」メニューの「2 オクターブ内に収める」で修正できます。',
        '按住琴键会按持续时长补齐音符': '鍵盤を押している間、その長さのノートを埋めます', '提示: 在画布中点击音轨行可选择/取消选择，可多选': 'ヒント: キャンバスのトラック行をクリックして選択/解除できます。複数選択可能です。',
        '勾选后可连接外部 MIDI 键盘/架子鼓进行输入': '外部 MIDI キーボードやドラムパッドを接続して入力できます。', '不保留': '保持しない', '全部保留': 'すべて保持', '按轨道选择': 'トラックを選択',
        '选择需要应用音色替代的 MIDI 音轨。未选中的音轨中超出音域的音符将保留原状。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': '音色置換を適用する MIDI トラックを選択してください。選択していないトラックの範囲外ノートはそのまま残ります。右のミニロールは音高 (Y) と時間 (X) のプレビューです。クリックでその位置から試聴します。',
        '为每个 NBS 音色配置高音/低音替代乐器。超出 MC 音域 (F#3~F#5) 的音符将切换到替代音色并使用等音高换算，保证实际播放音高不变。点击音色槽打开菜单试听当前音色，选择新音色后也会立即试听。': '各 NBS 音色に高音/低音の代替楽器を設定します。MC 音域 (F#3~F#5) を超えるノートは等音高の代替音色に切り替わり、実際の音高は変わりません。音色スロットをクリックしてメニューを開き、試聴して選択できます。',
        '目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。': 'Minecraft 音符ブロック標準音域 F#3-F#5 を目標にします。まずシフトを適用し、次に音色置換を試し、最後に強制折り返しを選択できます。',
        '偏移转换': '音程変換', '同分偏移': '同点シフト', '启用音色替代': '音色置換を有効', '强制转音域内': '音域内に強制折り返し', '全部': 'すべて', '不启用': '無効', '单独音符归一法': '音符ごとの正規化', '整体八度偏移法': 'トラック全体のオクターブ移動', '整体音调偏移法': 'トラック全体の半音移動',
        '速度:': 'テンポ:', '速度 (Tick/秒):': 'テンポ (tick/秒):', '音符': 'ノート', '音轨设置': 'トラック設定',
        '音域': '音域', '处理中': '処理中', '计算中…': '計算中...', 'MC 音域 F#3~F#5 (MIDI 54~78)': 'MC 音域 F#3-F#5 (MIDI 54-78)',
        'MIDI 试听': 'MIDI 試聴', 'NBS 试听': 'NBS 試聴', 'NBS 音色': 'NBS 音色', 'QQ交流群:': 'QQ コミュニティ:',
        '试听 MIDI 原音': 'MIDI 原音を試聴', '试听 NBS 拟合音色': 'NBS フィッティング音色を試聴', '试听 NBS 组合音': 'NBS 組合せ音を試聴',
        '点击选择高音替代音色': '高音の代替音色を選択', '点击选择低音替代音色': '低音の代替音色を選択',
        '恢复自动': '自動に戻す', '忽略': '無視', '自动(用拟合音色)': '自動 (フィッティング音色を使用)',
        '范围:': '範囲:', '范围: -': '範囲: -', 'MIDI 信息': 'MIDI 情報', '语言:': '言語:',
        '音域 F#3~F#5 (MIDI 54~78)': '音域 F#3-F#5 (MIDI 54-78)', '个音符': 'ノート', '加载中…': '読み込み中...', '音符: 0': '音符: 0',
        '处理中…': '処理中...', '操作': '操作', '时间': '時間', '大小': 'サイズ',
        '新音轨名称:': '新しいトラック名:', 'Clip 名称:': 'クリップ名:', '重命名 Clip': 'クリップ名を変更',
        '删除 Clip': 'クリップを削除', '播放/暂停': '再生/一時停止', '停止': '停止',
        'Minecraft 标准音域 MIDI 54~78 (NBS key 33~57, F#3~F#5)': 'Minecraft 標準音域: MIDI 54-78 (NBS key 33-57, F#3-F#5)',
        '优先使用音色替代解决超限音符，替代无法完全覆盖时才动用整体偏移。仅在模式2/3可用，模式0/1下灰显无效': '範囲外ノートはまず音色置換で解決し、置換でカバーしきれない場合のみ全体シフトを使います。モード 2/3 でのみ使用可能です。',
        '勾选后音色替代链用尽仍有超限时，强制对 MIDI 数值进行 ±12 取模归位。仅在模式2/3可用': '音色置換チェーンを使い切っても範囲外のノートが残る場合、MIDI 値を ±12 で折り返します。モード 2/3 でのみ使用可能です。',
        '配置超出音域音符的音色替代方案': '範囲外ノートの音色置換を設定',
        '一个格子多个音符': '1 マスに複数ノート', '上一个音符的音调和音色': '直前のノートの音程と音色',
        '下载': 'ダウンロード', '下载 MIDI 音色库': 'MIDI 音色ライブラリをダウンロード', '下载/解析失败, 将使用内置合成器': 'ダウンロード/解析に失敗。内蔵シンセを使用します',
        '例子 (1XXX2X3XXXXX1XX6):<br>': '例 (1XXX2X3XXXXX1XX6):<br>', '例子 (留空长度 = 2)：<br>': '例 (空き長さ = 2)：<br>',
        '保存 NBS': 'NBS を保存', '保存失败': '保存に失敗', '保存失败:': '保存に失敗:', '保存本地数据失败:': 'ローカルデータの保存に失敗:',
        '全部音符中筛选': '全ノートから絞り込み', '共享状态': '共有状態', '关闭残留': '残りを閉じる', '击掌声': 'クリック',
        '分': '分', '刚关闭菜单': 'メニューを閉じた直後',
        '勾选要从当前选择中移除的音色': '現在の選択から除外する音色をチェック',
        '填充的音符使用<b>上一个</b>原音符的音调和音色；最后一个音符会延长 4 个 tick 位置。': '埋めたノートは<b>直前の</b>ノートの音程と音色を使います。最後のノートは 4 tick 延長されます。',
        '处理失败': '処理に失敗', '处理完成': '処理が完了', '存储空间不足, 部分数据可能未保存': 'ストレージ不足。一部のデータが保存されない可能性があります',
        '导入失败': 'インポートに失敗', '导出失败:': 'エクスポートに失敗:', '将删除': '削除されます', '已处理': '処理済み',
        '已完成音域处理，调整了': '音域処理が完了しました。調整したノート数:', '已恢复默认替代配置': '音色置換設定を初期状態に戻しました',
        '已清理': 'クリーンアップ済み', '已连接': '接続済み', '已连接:': '接続済み:', '已选择': '選択済み', '已选择:': '選択済み:',
        '平移': 'パン', '当前无选择, 将先全选再筛选。勾选要排除的音色': '選択がないため、まず全選択してから絞り込みます。除外する音色をチェックしてください。',
        '当前没有可处理的音符。': '処理できるノートがありません。',
        '当前编辑内容会被清空，是否新建空文件？': '現在の編集内容は消去されます。新しい空ファイルを作成しますか?',
        '必须': '必須', '恢复默认替代': '音色置換を初期化',
        '您有未保存的编辑内容，确定要离开吗？数据已自动保存到本地。': '未保存の編集があります。このまま離れますか? データはローカルに自動保存されています。',
        '打开菜单': 'メニューを開く', '操作失败': '操作に失敗', '放置音符': 'ノートを置く',
        '文件数据不存在，可能已被清理': 'ファイルデータが存在しません。クリーンアップされた可能性があります', '文件数据不完整': 'ファイルデータが不完全です',
        '无效': '無効', '无法保存文件': 'ファイルを保存できません', '无法加载文件': 'ファイルを読み込めません', '无法加载本地文件': 'ローカルファイルを読み込めません',
        '无法导入 MIDI': 'MIDI をインポートできません', '无法导出文件': 'ファイルをエクスポートできません', '无法解析': '解析できません',
        '无法试听：NBS 音频引擎未就绪。': '試聴できません: NBS オーディオエンジンが準備できていません。',
        '无法读取 MIDI 信息': 'MIDI 情報を読み取れません', '无法读取 MIDI 信息: 返回数据异常': 'MIDI 情報を読み取れません: 応答データが異常です',
        '无音符': 'ノートなし', '暂不': '後で', '未下载 (播放 MIDI 音符时按设置提示)': '未ダウンロード (MIDI ノート再生時に設定に応じて通知)',
        '未加载歌曲': '曲が読み込まれていません', '未命名': '無題', '未知错误': '不明なエラー', '未选中有效音符': '有効なノートが選択されていません',
        '未配置 MIDI 音色库下载地址 (服务端 config.yaml)': 'MIDI 音色ライブラリのダウンロード URL が設定されていません (サーバー config.yaml)',
        '本次导入中已提示过的通道': '今回のインポートで通知済みのチャンネル',
        '正在下载': 'ダウンロード中', '正在处理...': '処理中...', '正在解析...': '解析中...', '正在解析音色库...': '音色ライブラリを解析中...',
        '永远差一格/有偏差': '常に 1 マスずれる/ずれがある', '没有添加任何音符 (可能选中区间已满)': 'ノートが追加されませんでした (選択区間が埋まっている可能性があります)',
        '浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听。': 'Web MIDI 未対応かつ TinySynth が読み込まれていないため試聴できません。',
        '浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。': 'Web MIDI 未対応かつ TinySynth が読み込まれていないため、元の音色を試聴できません。',
        '清理孤儿文件失败:': '孤立ファイルのクリーンアップに失敗:', '清理自动保存数据后重试成功': '自動保存データのクリーンアップ後に再試行して成功',
        '清理配额失败:': 'クォータのクリーンアップに失敗:', '清除音色库缓存': '音色ライブラリのキャッシュを消去',
        '确定清除已下载的 MIDI 音色库缓存吗？清除后需重新下载。': 'ダウンロード済みの MIDI 音色ライブラリのキャッシュを消去しますか? 消去後は再ダウンロードが必要です。',
        '确实选择了图片': '画像が選択されています', '秒': '秒', '自动': '自動',
        '规律使用“|”分隔，数字代表相对于选择区域的第几条音轨。<br>': '「|」で区切ります。数字は選択領域からのトラック位置を表します。<br>',
        '规律格式错误，请使用“|”分隔正整数，例如 1|2|1|3。': 'パターンの形式が正しくありません。「|」で正の整数を区切ってください。例: 1|2|1|3。',
        '解析返回空数据': '解析結果が空でした', '试听失败': '試聴に失敗', '试听此轨道': 'このトラックを試聴', '该轨道没有音符事件': 'このトラックにはノートイベントがありません',
        '请先在钢琴卷帘上选择至少 1 个音符再使用上下起伏。': 'アルペジオの動きを使うには、先にピアノロールで 1 つ以上のノートを選択してください。',
        '请先在钢琴卷帘上选择至少 1 个音符再使用清除延音。': 'サステイン削除を使うには、先にピアノロールで 1 つ以上のノートを選択してください。',
        '请先选择要偏移的音符': '先にシフトするノートを選択してください', '请先选择音符': '先にノートを選択してください',
        '请选择多个音符 (至少 2 个)。\n\n当前只选中了 1 个音符。': '複数のノート (2 つ以上) を選択してください。\n\n現在は 1 つのノートのみ選択されています。',
        '读取 MIDI 信息失败:': 'MIDI 情報の読み取りに失敗:', '配额超限, 已清理': 'クォータ超過。クリーンアップしました',
        '错误:': 'エラー:', '间隔': '間隔', '音色替代配置已保存': '音色置換設定を保存しました',
        '音色替代配置已恢复为默认。': '音色置換設定を初期状態に戻しました。', '音频上下文未就绪，无法试听。': 'オーディオコンテキストが準備できていないため試聴できません。',
        '预计': '推定', '鼓': 'ドラム', '鼓音符': 'ドラムノート', '鼠标放在哪格, 松手就落在哪格': 'マウスを置いたマスにノートが置かれます'
    });

    // ============ 补充缺失词条 (en-US) ============
    Object.assign(UI_TEXT['en-US'], {
        '通用': 'General', '个性化': 'Personalization', '清除': 'Clear', '平铺': 'Tile', '拉伸': 'Stretch',
        '缩放适配': 'Scale to fit', '普通半透明': 'Plain semi-transparent', '毛玻璃': 'Frosted glass', '亚克力': 'Acrylic',
        '未下载': 'Not downloaded', '条件选择': 'Conditional select', '粘贴失败': 'Paste failed',
        '立即下载': 'Download now', '清除缓存': 'Clear cache', '重命名轨道': 'Rename track',
        '背景图片:': 'Background image:', '背景模式:': 'Background mode:', '表面材质:': 'Surface material:',
        '网格材质:': 'Grid material:', '播放时询问': 'Ask when playing', '自动后台下载': 'Auto background download',
        '开源地址:': 'Open source:', '背景透明度:': 'Background transparency:', '面板透明度:': 'Panel transparency:',
        '网格透明度:': 'Grid transparency:', '音色库状态:': 'Soundfont status:', '音轨栏透明度:': 'Track panel transparency:',
        '不使用 (内置合成器)': 'Off (built-in synthesizer)', 'MIDI 音色库:': 'MIDI soundfont:',
        'MIDI 粘贴失败:': 'MIDI paste failed:', 'MIDI 导入失败:': 'MIDI import failed:',
        'MIDI 中没有可导入的音符': 'No notes to import from the MIDI file',
        '音色库下载失败, 将使用内置合成器': 'Soundfont download failed; using built-in synthesizer',
        '音符音量透明度 (音量越低越透明)': 'Note volume transparency (lower volume = more transparent)',
        '加载失败:': 'Load failed:', '长度': 'Length', '录制到:': 'Recording to:',
        '吸附到:': 'Snap to:', '吸附网格:': 'Snap grid:',
        '未开启吸附，默认到各子': 'Snap disabled, defaulting to subdivisions',
        '隐私声明': 'Privacy Notice', '同意': 'Agree', '语言': 'Language', 'MIDI 导入': 'Import MIDI',
        '请先在钢琴卷帘上选择至少 2 个音符再使用延音填充。\n\n使用方法:\n1. 框选一段范围的音符\n2. 点击"延音填充"\n3. 选择间隔参数': 'Select at least 2 notes in the piano roll before using Sustain fill.\n\nHow to use:\n1. Select a range of notes\n2. Click "Sustain fill"\n3. Choose an interval',
        '播放 MIDI 音符需要音色库 (SF3/SF2) 才能获得真实音色。是否现在下载？下载后可离线使用，解析期间仍可用内置合成器播放。': 'Playing MIDI notes requires a soundfont (SF3/SF2) for authentic timbres. Download now? It can be used offline after download; the built-in synthesizer remains available during parsing.',
        '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'Tip: the background image covers the entire page. Transparency 100% = fully transparent, 0% = opaque. Surface material controls the toolbar; grid material controls the note grid area separately. Panel transparency controls toolbar opacity; track panel transparency controls the left track info panel.',
        // innerHTML 拆分后的文本片段
        '功能说明：': 'How it works: ',
        '按行处理选中的多个音符，在每行中从选择区间的开始点往后填充。': 'Processes selected notes row by row, filling forward from the start of the selection range.',
        '填充的音符使用': 'Filled notes use ',
        '上一个': 'the previous',
        '原音符的音调和音色；最后一个音符会延长 4 个 tick 位置。': ' note\'s pitch and timbre; the last note is extended by 4 ticks.',
        '无空位': 'no gap',
        '(1 个空位)': '(1 gap)',
        '(2 个空位)': '(2 gaps)',
        '间隔 (空位数量)：': 'Interval (gap count):',
        '0 = 紧贴无空位；推荐 1-3': '0 = no gaps; recommended 1-3',
        '按音轨处理选中的音符，把同一音轨里连续重复的音符截短，并在每组音符之间保留固定的空 tick 数。': 'Processes selected notes per track, shortening consecutive duplicate notes and keeping a fixed number of empty ticks between groups.',
        '留空长度 (空 tick 数)：': 'Gap length (empty ticks):',
        '0 = 只删除同 tick 的完全重复音符；推荐 1-3': '0 = only remove exact duplicates on the same tick; recommended 1-3',
        '将选中的音符按时间顺序依次分配到不同音轨，形成跨音轨的起伏规律。': 'Distributes selected notes across tracks in time order, creating a cross-track arpeggio pattern.',
        '例如': 'e.g.',
        '：第1个音符放到第1轨，第2个放到第2轨，第3个回到第1轨，第4个放到第3轨，然后循环。': ': note 1 goes to track 1, note 2 to track 2, note 3 back to track 1, note 4 to track 3, then loops.',
        '规律：': 'Pattern:',
        '用"|"分隔正整数，如 1|2|1|3': 'Separate positive integers with "|", e.g. 1|2|1|3',
        '选择延音轨道': 'Select sustain tracks',
        '勾选需要应用延音的 MIDI 轨道（多选）。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'Check MIDI tracks to apply sustain (multi-select). The mini roll on the right previews pitch (Y) over time (X); click to preview from that point.',
        // 音域处理模式提示
        '不进行音域转换': 'No range conversion',
        '超出音域的音符会按八度归一': 'Out-of-range notes folded by octave',
        '自动偏移、音色替代并强制归位': 'Auto-shift, timbre substitution, and forced fold',
        '自动偏移并按需使用音色替代': 'Auto-shift with on-demand timbre substitution',
        // 音符时值
        '1/2音符': '1/2 note', '1/4音符': '1/4 note', '1/8音符': '1/8 note', '1/16音符': '1/16 note', '1/32音符': '1/32 note',
        // 其他
        '更新日志': "What's new",
        '音色库已就绪': 'soundfont ready',
        '个预设)': 'presets)',
        '已就绪 (': 'ready ('
    });

    // ============ 补充缺失词条 (ja-JP) ============
    Object.assign(UI_TEXT['ja-JP'], {
        '通用': '一般', '个性化': 'パーソナライズ', '清除': 'クリア', '平铺': 'タイル', '拉伸': 'ストレッチ',
        '缩放适配': 'スケールフィット', '普通半透明': '通常の半透明', '毛玻璃': 'すりガラス', '亚克力': 'アクリル',
        '未下载': '未ダウンロード', '条件选择': '条件選択', '粘贴失败': '貼り付けに失敗',
        '立即下载': '今すぐダウンロード', '清除缓存': 'キャッシュを消去', '重命名轨道': 'トラック名を変更',
        '背景图片:': '背景画像:', '背景模式:': '背景モード:', '表面材质:': '表面素材:',
        '网格材质:': 'グリッド素材:', '播放时询问': '再生時に確認', '自动后台下载': '自動バックグラウンドダウンロード',
        '开源地址:': 'オープンソース:', '背景透明度:': '背景の透明度:', '面板透明度:': 'パネルの透明度:',
        '网格透明度:': 'グリッドの透明度:', '音色库状态:': '音色ライブラリの状態:', '音轨栏透明度:': 'トラックパネルの透明度:',
        '不使用 (内置合成器)': '使用しない (内蔵シンセ)', 'MIDI 音色库:': 'MIDI 音色ライブラリ:',
        'MIDI 粘贴失败:': 'MIDI の貼り付けに失敗:', 'MIDI 导入失败:': 'MIDI のインポートに失敗:',
        'MIDI 中没有可导入的音符': 'MIDI にインポート可能なノートがありません',
        '音色库下载失败, 将使用内置合成器': '音色ライブラリのダウンロードに失敗。内蔵シンセを使用します',
        '音符音量透明度 (音量越低越透明)': 'ノート音量の透明度 (音量が低いほど透明)',
        '加载失败:': '読み込みに失敗:', '长度': '長さ', '录制到:': '録音先:',
        '吸附到:': 'スナップ先:', '吸附网格:': 'スナップグリッド:',
        '未开启吸附，默认到各子': 'スナップ無効、サブディビジョンにデフォルト',
        '隐私声明': 'プライバシーに関するお知らせ', '同意': '同意する', '语言': '言語', 'MIDI 导入': 'MIDI をインポート',
        '请先在钢琴卷帘上选择至少 2 个音符再使用延音填充。\n\n使用方法:\n1. 框选一段范围的音符\n2. 点击"延音填充"\n3. 选择间隔参数': 'サステイン補完を使うには、先にピアノロールで 2 つ以上のノートを選択してください。\n\n使い方:\n1. ノートの範囲を選択\n2.「サステインを補完」をクリック\n3. 間隔パラメータを選択',
        '播放 MIDI 音符需要音色库 (SF3/SF2) 才能获得真实音色。是否现在下载？下载后可离线使用，解析期间仍可用内置合成器播放。': 'MIDI ノートの再生には音色ライブラリ (SF3/SF2) が必要です。今すぐダウンロードしますか? ダウンロード後はオフラインで使用可能です。解析中も内蔵シンセで再生できます。',
        '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'ヒント: 背景画像はページ全体をカバーします。透明度 100% = 完全に透明、0% = 不透明。表面素材はツールバーを、グリッド素材はノートグリッド領域を個別に制御します。パネルの透明度はツールバーの不透明度を、トラックパネルの透明度は左側のトラック情報パネルを個別に制御します。',
        // innerHTML 拆分后的文本片段
        '功能说明：': '使い方：',
        '按行处理选中的多个音符，在每行中从选择区间的开始点往后填充。': '選択したノートを行ごとに処理し、選択範囲の先頭から前方に向かって埋めます。',
        '填充的音符使用': '埋めるノートは',
        '上一个': '直前の',
        '原音符的音调和音色；最后一个音符会延长 4 个 tick 位置。': 'ノートの音程と音色を使います。最後のノートは 4 tick 延長されます。',
        '无空位': '空きなし',
        '(1 个空位)': '(1 空き)',
        '(2 个空位)': '(2 空き)',
        '间隔 (空位数量)：': '間隔 (空き数):',
        '0 = 紧贴无空位；推荐 1-3': '0 = 空きなし; 推奨 1-3',
        '按音轨处理选中的音符，把同一音轨里连续重复的音符截短，并在每组音符之间保留固定的空 tick 数。': '選択したノートをトラックごとに処理し、同じトラック内の連続重複ノートを短くし、各グループ間に固定の空 tick を確保します。',
        '留空长度 (空 tick 数)：': '空き長さ (空 tick 数):',
        '0 = 只删除同 tick 的完全重复音符；推荐 1-3': '0 = 同 tick の完全重複のみ削除; 推奨 1-3',
        '将选中的音符按时间顺序依次分配到不同音轨，形成跨音轨的起伏规律。': '選択したノートを時間順に異なるトラックに振り分け、トラックをまたぐアルペジオパターンを作ります。',
        '例如': '例',
        '：第1个音符放到第1轨，第2个放到第2轨，第3个回到第1轨，第4个放到第3轨，然后循环。': ': ノート 1 はトラック 1、ノート 2 はトラック 2、ノート 3 はトラック 1 に戻り、ノート 4 はトラック 3、以降ループします。',
        '规律：': 'パターン:',
        '用"|"分隔正整数，如 1|2|1|3': '「|」で正の整数を区切ります。例: 1|2|1|3',
        '选择延音轨道': 'サステイントラックを選択',
        '勾选需要应用延音的 MIDI 轨道（多选）。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'サステインを適用する MIDI トラックにチェックを入れてください (複数選択可)。右のミニロールは音高 (Y) と時間 (X) のプレビューです。クリックでその位置から試聴します。',
        // 音域处理模式提示
        '不进行音域转换': '音域変換なし',
        '超出音域的音符会按八度归一': '範囲外のノートはオクターブで折り返し',
        '自动偏移、音色替代并强制归位': '自動シフト・音色置換・強制折り返し',
        '自动偏移并按需使用音色替代': '自動シフト・必要に応じて音色置換',
        // 音符时值
        '1/2音符': '1/2音符', '1/4音符': '1/4音符', '1/8音符': '1/8音符', '1/16音符': '1/16音符', '1/32音符': '1/32音符',
        // 其他
        '更新日志': '更新情報',
        '音色库已就绪': '音色ライブラリ準備完了',
        '个预设)': 'プリセット)',
        '已就绪 (': '準備完了 ('
    });

    // ============ 运行时补充词条 2 (ja-JP) ============
    // 与 en-US 补充词条 2 对应: 新增功能的错误消息与弹窗文本。
    Object.assign(UI_TEXT['ja-JP'], {
        '请求失败': 'リクエストに失敗', '网络错误': 'ネットワークエラー', '请求超时': 'リクエストがタイムアウト',
        '文件损坏': 'ファイルが破損しています', '磁盘已满': 'ディスク容量が不足しています', '编码错误': 'エンコードエラー',
        '立体声': 'ステレオ', '单声道': 'モノラル',
        '播放失败': '再生に失敗', '暂停失败': '一時停止に失敗', '停止失败': '停止に失敗',
        '读取文件失败': 'ファイルの読み込みに失敗', '添加音符失败': 'ノートの追加に失敗', '更新音符失败': 'ノートの更新に失敗',
        '删除音符失败': 'ノートの削除に失敗', '批量操作失败': '一括操作に失敗', '设置速度失败': 'テンポの設定に失敗',
        '加载NBS文件失败:': 'NBS ファイルの読み込みに失敗:', '导出NBS失败:': 'NBS エクスポートに失敗:', '导入MIDI失败:': 'MIDI インポートに失敗:',
        '读取MIDI信息失败:': 'MIDI 情報の読み取りに失敗:',
        'NBS: 意外的文件结束': 'NBS: 予期しないファイルの終端', 'MIDI: 意外的文件结束': 'MIDI: 予期しないファイルの終端',
        'NBS: 字符串超出文件范围': 'NBS: 文字列がファイルの範囲外です',
        '无效的 MIDI 文件：缺少 MThd 头': '無効な MIDI ファイル: MThd ヘッダーがありません',
        'MIDI 文件格式损坏或数据不完整 (轨道': 'MIDI ファイルが破損しているか不完全です (トラック',
        '缺少 sdta 块': 'sdta チャンクがありません', '缺少 pdta 块': 'pdta チャンクがありません',
        '不是 RIFF 文件': 'RIFF ファイルではありません', '不是 SoundFont 文件 (form=': 'SoundFont ファイルではありません (form=',
        'AudioContext 不可用': 'AudioContext を利用できません',
        'MIDI 音色库': 'MIDI 音色ライブラリ', '内置解析器': '内蔵パーサー',
        '音色覆盖提示': '音色上書きの注意',
        '当前使用拟合音色。你手动选择了具体乐器后，': '現在フィッティング音色を使用中です。具体的な楽器を手動で選択すると、',
        '该通道将不再跟随拟合结果改变': 'このチャンネルはフィッティング結果に追従しなくなります',
        '，即后续在"音色拟合"标签页中调整的组合音色不会应用到这个通道。': '、以降は「音色フィッティング」タブで調整した組み合わせ音色はこのチャンネルに適用されません。',
        '归一化': '正規化', '无偏移': 'シフトなし',
        '• 间隔 0：': '• 間隔 0: ', '• 间隔 1：': '• 間隔 1: ', '• 间隔 2：': '• 間隔 2: ',
        '(无空位)': '(空きなし)',
        '(超出范围)': '(範囲外)', '+ 添加音轨': '+ トラックを追加',
        '用“|”分隔正整数，如 1|2|1|3': '「|」で正の整数を区切ります。例: 1|2|1|3',
        '及其所有 Clip?': 'とそのすべての Clip?'
    });

    // ============ 消除重复音符: 各语言静态词条 ============
    // en-US 的对应词条已在运行时补充词条 3 中提供, 这里补齐其余语言,
    // 避免非英语界面回退到英文。
    Object.assign(UI_TEXT['ja-JP'], {
        '消除重复音符': '重複ノートを削除', '没有可去重的音符': '削除できる重複ノートはありません',
        '重排序音符': 'ノートを並べ直す',
        '合并并消除伪延音': '疑似持続音の統合と削除',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': '近接した繰り返しノートをロングトーンに統合し、余分なノートを削除します。オフにすると小節をまたぐ関連をすべて無視し、各時点を独立に処理します（オフ推奨。オンにすると品質が大きく低下する場合があります）。',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'このスイッチはエンジンごとに保存され、現在は選択中のエンジンにのみ作用します。',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': '重複ノートを削除した後、下の隣接トラックで孤立した連続ノートを上へ移動して空きを埋めます',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': '同じ時間・音色・音程が完全に一致する重複ノートを削除します。「ノートを並べ直す」をオンにすると、削除後に孤立した連続ノートを上へ移動して空きを埋めます',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': '重複ノートは見つかりませんでした。\n判定基準: 同一時間(tick) + 同一音色 + 同一音程、音量差は無視。',
        // 歌曲压缩
        '歌曲压缩': '曲の圧縮', '压缩等级': '圧縮レベル', '算法模型': 'アルゴリズムモデル',
        '近乎无损': 'ほぼロスレス', '高质量': '高品質', '中等质量': '中品質', '较低质量': '低品質', '最低质量': '最低品質',
        '压缩方式': '圧縮方式', '仅删除重复音符': '重複ノートのみ削除', '使用压缩算法': '圧縮アルゴリズムを使う',
        '轻度压缩': '軽度圧縮', '中度压缩': '中度圧縮', '较强压缩': '強めの圧縮', '最强压缩': '最大圧縮',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': '同じ時点・同じ音色・同じ音高で完全に重複したノートだけを削除します。品質への影響はほとんどありません。',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': '重複除去に加えて「圧縮レベル」に従い存在感の低いノートを削除し、圧縮率を高めます。',
        '只删除完全重复的音符，几乎不影响质量。': '完全に重複したノートだけを削除します。品質への影響はほとんどありません。',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': '選択した「圧縮レベル」で存在感の低いノートを削除します。レベルが上がるほど圧縮率と品質損失が増えます。',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': '最大圧縮：ノートを削除しすぎる可能性があり、聴感が明らかに損なわれることがあります',
        '务实启发式（快速）': '実用的ヒューリスティック（高速）', '感知引擎（智能）': '知覚エンジン（スマート）',
        '压缩': '圧縮', '歌曲太短，无法压缩': '曲が短すぎて圧縮できません', '未删除任何音符': '削除された音符はありません',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': '最低品質: ノートが削除されすぎて、聴感が著しく損なわれる可能性があります',
        '预计删除': '削除見込み', '保留': '保持',
        '正在计算…': '計算中…', '正在压缩': '圧縮中',
        '减轻处理的轨道': '軽減処理するトラック', '不被处理的轨道': '処理しないトラック',
        '选择': '選択', '未选择任何轨道': 'トラックが選択されていません',
        '选择减轻处理的轨道': '軽減処理するトラックを選択',
        '选择不被处理的轨道': '処理しないトラックを選択',
        '在画布中点击音轨行进行选择/取消，可多选。': 'キャンバス内のトラック行をクリックして選択/解除できます（複数選択可）。',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': '3つのモデルは残すノートが異なります。存在感エンジンは物理的な可聴性で判定し、実際の聴感に最も近いです。',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': '実用的ヒューリスティック（高速）：ルールベースの簡易採点（根音/三度/五度、オクターブ重複、拍、ベロシティ、長さ）で高速かつ安定。',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': '知覚エンジン（スマート）：声部の役割、拍、長さ、ベロシティ、マスキング、打楽器密度で総合採点し、聴感に近いがやや低速。',
        '存在感エンジン（物理）': '存在感エンジン（物理）',
        '存在感エンジン（物理）：合成音声での実際の可聴貢献度（エネルギー重ね合わせ、マスキング場、可聴マージン）で削除を判定。調性に依存せず、結果は予測可能。': '存在感エンジン（物理）：合成音声での実際の可聴貢献度（エネルギー重ね合わせ、マスキング場、可聴マージン）で削除を判定。調性に依存せず、結果は予測可能。',
        '存在感エンジンは物理的な可聴性で削除を判定し、実際の聴感に最も近く、混沌とした/無調の入力でも安定。': '存在感エンジンは物理的な可聴性で削除を判定し、実際の聴感に最も近く、混沌とした/無調の入力でも安定。',
    });
    Object.assign(UI_TEXT['pt-BR'], {
        '消除重复音符': 'Remover notas duplicadas', '没有可去重的音符': 'Nenhuma nota para desduplicar',
        '重排序音符': 'Reordenar notas',
        '合并并消除伪延音': 'Mesclar e remover pseudo-sustain',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': 'Mescla notas repetidas muito próximas em uma nota sustentada e remove as excedentes. Quando desativado, ignora todas as relações entre compassos e processa cada instante de forma independente (recomendado desativado; ativar pode degradar gravemente a qualidade).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'Este interruptor é salvo por mecanismo e atualmente afeta apenas o mecanismo selecionado.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': 'Após excluir as duplicadas, move para cima as notas consecutivas isoladas da faixa adjacente abaixo para preencher as lacunas',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': 'Remove notas com o mesmo tick, instrumento e altura; marque "Reordenar notas" para mover para cima as notas consecutivas isoladas e preencher as lacunas',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': 'Nenhuma nota duplicada encontrada.\nCritério: mesmo tick + mesmo instrumento + mesma altura, ignorando a intensidade.',
        // 歌曲压缩
        '歌曲压缩': 'Compressão da música', '压缩等级': 'Nível de compressão', '算法模型': 'Modelo de algoritmo',
        '近乎无损': 'Quase sem perdas', '高质量': 'Alta qualidade', '中等质量': 'Qualidade média', '较低质量': 'Qualidade baixa', '最低质量': 'Qualidade mínima',
        '压缩方式': 'Modo de compressão', '仅删除重复音符': 'Remover apenas duplicadas', '使用压缩算法': 'Usar algoritmo de compressão',
        '轻度压缩': 'Compressão leve', '中度压缩': 'Compressão média', '较强压缩': 'Compressão forte', '最强压缩': 'Compressão máxima',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': 'Remove apenas notas exatamente duplicadas no mesmo tick, instrumento e tom; a qualidade quase não é afetada.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': 'Além da deduplicação, remove notas de baixa presença conforme o nível de compressão para obter uma taxa maior.',
        '只删除完全重复的音符，几乎不影响质量。': 'Remove apenas notas exatamente duplicadas; a qualidade quase não é afetada.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': 'Remove notas de baixa presença no nível de compressão escolhido; a taxa sobe e a perda de qualidade aumenta com o nível.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': 'Compressão máxima: pode remover notas em excesso e a música pode soar visivelmente degradada',
        '务实启发式（快速）': 'Heurística pragmática (rápida)', '感知引擎（智能）': 'Motor perceptual (inteligente)',
        '压缩': 'Comprimir', '歌曲太短，无法压缩': 'Música curta demais para comprimir', '未删除任何音符': 'Nenhuma nota removida',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': 'Qualidade mínima: as notas podem ser removidas em excesso e a música pode soar bastante degradada',
        '预计删除': 'Remoção estimada', '保留': 'Mantidas',
        '正在计算…': 'Calculando…', '正在压缩': 'Comprimindo',
        '减轻处理的轨道': 'Faixas com processamento reduzido', '不被处理的轨道': 'Faixas sem processamento',
        '选择': 'Selecionar', '未选择任何轨道': 'Nenhuma faixa selecionada',
        '选择减轻处理的轨道': 'Selecionar faixas com processamento reduzido',
        '选择不被处理的轨道': 'Selecionar faixas sem processamento',
        '在画布中点击音轨行进行选择/取消，可多选。': 'Clique nas linhas de faixa na tela para selecionar ou desselecionar. É possível selecionar várias.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': 'Os três modelos mantêm notas diferentes; o motor de presença julga pela audibilidade física, o mais próximo do que realmente soa.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': 'Heurística pragmática (rápida): pontua com regras simples (fundamental/terça/quinta, duplicatas de oitava, tempo, intensidade, duração) — rápida e estável.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': 'Motor perceptual (inteligente): pontua por papel da voz, tempo, duração, intensidade, mascaramento e densidade de percussão — mais próximo da audição, um pouco mais lento.',
        '存在感引擎（物理）': 'Motor de presença (físico)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': 'Motor de presença (físico): remove notas pela contribuição realmente audível no áudio renderizado (soma de energia, campo de mascaramento, margem de audibilidade) — sem depender de tonalidade, resultado previsível.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': 'O motor de presença remove pela audibilidade física, o mais próximo do que realmente soa — estável mesmo em entradas caóticas/atonais.',
    });
    Object.assign(UI_TEXT['id-ID'], {
        '消除重复音符': 'Hapus not duplikat', '没有可去重的音符': 'Tidak ada not untuk dihapus duplikatnya',
        '重排序音符': 'Susun ulang not',
        '合并并消除伪延音': 'Gabungkan dan hapus pseudo-sustain',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': 'Menggabungkan not berulang yang berdekatan menjadi nada panjang dan menghapus kelebihannya. Saat nonaktif, semua hubungan antar-bar diabaikan dan setiap titik waktu diproses secara independen (disarankan nonaktif; mengaktifkan dapat menurunkan kualitas secara serius).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'Tombol ini disimpan per mesin dan saat ini hanya memengaruhi mesin yang dipilih.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': 'Setelah menghapus not duplikat, not berurutan yang terisolasi di trek bersebelahan di bawah dipindahkan ke atas untuk mengisi celah',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': 'Hapus not dengan tick, instrumen, dan nada yang sama; aktifkan "Susun ulang not" untuk memindahkan not berurutan yang terisolasi ke atas dan mengisi celah',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': 'Tidak ada not duplikat ditemukan.\nKriteria: tick + instrumen + nada yang sama, abaikan perbedaan kecepatan.',
        // 歌曲压缩
        '歌曲压缩': 'Kompresi lagu', '压缩等级': 'Tingkat kompresi', '算法模型': 'Model algoritma',
        '近乎无损': 'Hampir tanpa kehilangan', '高质量': 'Kualitas tinggi', '中等质量': 'Kualitas sedang', '较低质量': 'Kualitas rendah', '最低质量': 'Kualitas terendah',
        '压缩方式': 'Mode kompresi', '仅删除重复音符': 'Hapus hanya not duplikat', '使用压缩算法': 'Gunakan algoritma kompresi',
        '轻度压缩': 'Kompresi ringan', '中度压缩': 'Kompresi sedang', '较强压缩': 'Kompresi kuat', '最强压缩': 'Kompresi maksimum',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': 'Hanya menghapus not yang benar-benar duplikat pada tick, instrumen, dan nada yang sama; kualitas hampir tidak terpengaruh.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': 'Selain deduplikasi, menghapus not berpresensi rendah sesuai tingkat kompresi untuk rasio yang lebih tinggi.',
        '只删除完全重复的音符，几乎不影响质量。': 'Hanya menghapus not yang benar-benar duplikat; kualitas hampir tidak terpengaruh.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': 'Menghapus not berpresensi rendah pada tingkat kompresi terpilih; rasio naik dan kehilangan kualitas bertambah seiring tingkat.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': 'Kompresi maksimum: not mungkin terhapus berlebihan dan lagu bisa terdengar jelas menurun',
        '务实启发式（快速）': 'Heuristik pragmatis (cepat)', '感知引擎（智能）': 'Mesin persepsi (cerdas)',
        '压缩': 'Kompres', '歌曲太短，无法压缩': 'Lagu terlalu pendek untuk dikompres', '未删除任何音符': 'Tidak ada not yang dihapus',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': 'Kualitas terendah: not bisa terhapus berlebihan dan lagu bisa terdengar sangat rusak',
        '预计删除': 'Perkiraan dihapus', '保留': 'Dipertahankan',
        '正在计算…': 'Menghitung…', '正在压缩': 'Mengompresi',
        '减轻处理的轨道': 'Trek dengan pemrosesan ringan', '不被处理的轨道': 'Trek tanpa pemrosesan',
        '选择': 'Pilih', '未选择任何轨道': 'Tidak ada trek dipilih',
        '选择减轻处理的轨道': 'Pilih trek dengan pemrosesan ringan',
        '选择不被处理的轨道': 'Pilih trek tanpa pemrosesan',
        '在画布中点击音轨行进行选择/取消，可多选。': 'Klik baris trek di kanvas untuk memilih atau membatalkan. Bisa pilih banyak.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': 'Ketiga model menyimpan not yang berbeda; mesin kehadiran menilai berdasarkan keterdengaran fisik, paling dekat dengan yang sebenarnya terdengar.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': 'Heuristik pragmatis (cepat): menilai dengan aturan sederhana (nada dasar/ters/kuint, duplikat oktaf, ketukan, velocity, durasi) — cepat dan stabil.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': 'Mesin persepsi (cerdas): menilai dari peran suara, ketukan, durasi, velocity, masking, dan kerapatan perkusi — lebih mendekati pendengaran, sedikit lebih lambat.',
        '存在感引擎（物理）': 'Mesin kehadiran (fisik)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': 'Mesin kehadiran (fisik): menghapus not berdasarkan kontribusi yang benar-benar terdengar pada audio (penjumlahan energi, medan masking, margin keterdengaran) — tanpa bergantung tonalitas, hasil dapat diprediksi.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': 'Mesin kehadiran menghapus berdasarkan keterdengaran fisik, paling dekat dengan yang benar-benar terdengar — stabil bahkan pada input yang kacau/atonal.',
    });
    Object.assign(UI_TEXT['es-ES'], {
        '消除重复音符': 'Eliminar notas duplicadas', '没有可去重的音符': 'No hay notas para desduplicar',
        '重排序音符': 'Reordenar notas',
        '合并并消除伪延音': 'Combinar y eliminar pseudo-sustain',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': 'Combina notas repetidas muy próximas en una nota sostenida y elimina las sobrantes. Si se desactiva, ignora todas las relaciones entre compases y procesa cada instante de forma independiente (recomendado desactivado; activarlo puede degradar gravemente la calidad).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'Este interruptor se guarda por motor y actualmente solo afecta al motor seleccionado.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': 'Tras eliminar los duplicados, las notas consecutivas aisladas de la pista adyacente inferior suben para rellenar los huecos',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': 'Elimina notas con el mismo tick, instrumento y altura; activa "Reordenar notas" para subir las notas consecutivas aisladas y rellenar los huecos',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': 'No se encontraron notas duplicadas.\nCriterio: mismo tick + mismo instrumento + misma altura, ignorando la velocidad.',
        // 歌曲压缩
        '歌曲压缩': 'Compresión de canción', '压缩等级': 'Nivel de compresión', '算法模型': 'Modelo de algoritmo',
        '近乎无损': 'Casi sin pérdidas', '高质量': 'Alta calidad', '中等质量': 'Calidad media', '较低质量': 'Calidad baja', '最低质量': 'Calidad mínima',
        '压缩方式': 'Modo de compresión', '仅删除重复音符': 'Eliminar solo duplicadas', '使用压缩算法': 'Usar algoritmo de compresión',
        '轻度压缩': 'Compresión ligera', '中度压缩': 'Compresión media', '较强压缩': 'Compresión fuerte', '最强压缩': 'Compresión máxima',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': 'Elimina solo notas exactamente duplicadas en el mismo tick, instrumento y tono; la calidad casi no se ve afectada.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': 'Además de la deduplicación, elimina notas de baja presencia según el nivel de compresión para lograr mayor tasa.',
        '只删除完全重复的音符，几乎不影响质量。': 'Elimina solo notas exactamente duplicadas; la calidad casi no se ve afectada.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': 'Elimina notas de baja presencia con el nivel de compresión elegido; la tasa sube y la pérdida de calidad crece con el nivel.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': 'Compresión máxima: puede eliminar notas en exceso y la canción puede sonar claramente degradada',
        '务实启发式（快速）': 'Heurística pragmática (rápida)', '感知引擎（智能）': 'Motor perceptual (inteligente)',
        '压缩': 'Comprimir', '歌曲太短，无法压缩': 'La canción es demasiado corta para comprimir', '未删除任何音符': 'No se eliminó ninguna nota',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': 'Calidad mínima: podrían eliminarse demasiadas notas y la canción podría sonar muy degradada',
        '预计删除': 'Eliminación estimada', '保留': 'Conservadas',
        '正在计算…': 'Calculando…', '正在压缩': 'Comprimiendo',
        '减轻处理的轨道': 'Pistas con procesamiento reducido', '不被处理的轨道': 'Pistas sin procesar',
        '选择': 'Seleccionar', '未选择任何轨道': 'Ninguna pista seleccionada',
        '选择减轻处理的轨道': 'Seleccionar pistas con procesamiento reducido',
        '选择不被处理的轨道': 'Seleccionar pistas sin procesar',
        '在画布中点击音轨行进行选择/取消，可多选。': 'Haz clic en las filas de pista del lienzo para seleccionar o deseleccionar. Se permite selección múltiple.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': 'Los tres modelos conservan notas diferentes; el motor de presencia juzga por audibilidad física, lo más cercano a lo que realmente suena.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': 'Heurística pragmática (rápida): puntúa con reglas simples (fundamental/tercera/quinta, duplicados de octava, pulso, intensidad, duración) — rápida y estable.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': 'Motor perceptual (inteligente): puntúa por rol de la voz, pulso, duración, intensidad, enmascaramiento y densidad de percusión — más fiel al oído, algo más lento.',
        '存在感引擎（物理）': 'Motor de presencia (físico)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': 'Motor de presencia (físico): elimina notas por su contribución realmente audible en el audio (suma de energía, campo de enmascaramiento, margen de audibilidad) — sin depender de la tonalidad, resultado predecible.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': 'El motor de presencia elimina por audibilidad física, el más cercano a lo que realmente suena — estable incluso en entradas caóticas/atonales.',
    });
    Object.assign(UI_TEXT['ru-RU'], {
        '消除重复音符': 'Удалить дубликаты нот', '没有可去重的音符': 'Нет нот для удаления дубликатов',
        '重排序音符': 'Переставить ноты',
        '合并并消除伪延音': 'Объединять и удалять псевдосустейн',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': 'Объединяет близко расположенные повторяющиеся ноты в длинную ноту и удаляет лишние. Если выключено, все связи между тактами игнорируются, и каждый момент обрабатывается независимо (рекомендуется выключено; включение может серьёзно ухудшить качество).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'Этот переключатель сохраняется отдельно для каждого движка и сейчас влияет только на выбранный движок.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': 'После удаления дубликатов изолированные последовательные ноты на соседней дорожке снизу сдвигаются вверх, заполняя пустоты',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': 'Удаляет ноты с одинаковым tick, инструментом и высотой; включите «Переставить ноты», чтобы сдвинуть изолированные последовательные ноты вверх и заполнить пустоты',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': 'Дубликаты нот не найдены.\nКритерий: тот же tick + тот же инструмент + та же высота, разница громкости игнорируется.',
        // 歌曲压缩
        '歌曲压缩': 'Сжатие песни', '压缩等级': 'Уровень сжатия', '算法模型': 'Модель алгоритма',
        '近乎无损': 'Почти без потерь', '高质量': 'Высокое качество', '中等质量': 'Среднее качество', '较低质量': 'Низкое качество', '最低质量': 'Минимальное качество',
        '压缩方式': 'Режим сжатия', '仅删除重复音符': 'Удалять только дубликаты', '使用压缩算法': 'Использовать алгоритм сжатия',
        '轻度压缩': 'Лёгкое сжатие', '中度压缩': 'Среднее сжатие', '较强压缩': 'Сильное сжатие', '最强压缩': 'Максимальное сжатие',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': 'Удаляет только полностью совпадающие ноты (тот же тик, инструмент и высота); качество почти не страдает.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': 'Помимо удаления дубликатов убирает малозаметные ноты согласно уровню сжатия для более высокой степени сжатия.',
        '只删除完全重复的音符，几乎不影响质量。': 'Удаляет только полностью совпадающие ноты; качество почти не страдает.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': 'Удаляет малозаметные ноты на выбранном уровне сжатия; степень сжатия растёт, а потеря качества увеличивается с уровнем.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': 'Максимальное сжатие: возможна избыточная очистка нот, звучание может заметно ухудшиться',
        '务实启发式（快速）': 'Прагматическая эвристика (быстро)', '感知引擎（智能）': 'Перцептивный движок (умный)',
        '压缩': 'Сжать', '歌曲太短，无法压缩': 'Песня слишком короткая для сжатия', '未删除任何音符': 'Ни одной ноты не удалено',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': 'Минимальное качество: возможны чрезмерные удаления нот, звучание может заметно ухудшиться',
        '预计删除': 'Ожидаемое удаление', '保留': 'Останется',
        '正在计算…': 'Вычисление…', '正在压缩': 'Сжатие…',
        '减轻处理的轨道': 'Дорожки с облегчённой обработкой', '不被处理的轨道': 'Дорожки без обработки',
        '选择': 'Выбрать', '未选择任何轨道': 'Дорожки не выбраны',
        '选择减轻处理的轨道': 'Выбрать дорожки с облегчённой обработкой',
        '选择不被处理的轨道': 'Выбрать дорожки без обработки',
        '在画布中点击音轨行进行选择/取消，可多选。': 'Щёлкайте по строкам дорожек на холсте, чтобы выбрать или снять выбор. Можно выбрать несколько.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': 'Три движка сохраняют разные ноты; движок присутствия судит по физической слышимости, ближе всего к реальному звучанию.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': 'Прагматическая эвристика (быстро): оценка по простым правилам (основной тон/терция/квинта, дубли октав, доля, velocity, длительность) — быстро и стабильно.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': 'Перцептивный движок (умный): оценка по роли голоса, доле, длительности, velocity, маскировке и плотности перкуссии — ближе к восприятию, чуть медленнее.',
        '存在感引擎（物理）': 'Движок присутствия (физический)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': 'Движок присутствия (физический): удаляет ноты по реальной слышимости в синтезированном аудио (сумма энергий, маскирующее поле, запас слышимости) — без опоры на тональность, результат предсказуем.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': 'Движок присутствия удаляет по физической слышимости, ближе всего к реальному звучанию — стабилен даже на хаотичных/атональных данных.',
    });
    Object.assign(UI_TEXT['de-DE'], {
        '消除重复音符': 'Doppelte Noten entfernen', '没有可去重的音符': 'Keine Noten zum Entfernen von Duplikaten',
        '重排序音符': 'Noten neu anordnen',
        '合并并消除伪延音': 'Pseudo-Sustain zusammenführen und entfernen',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': 'Führt eng benachbarte wiederholte Noten zu einem gehaltenen Ton zusammen und entfernt die überzähligen. Wenn deaktiviert, werden alle taktübergreifenden Beziehungen ignoriert und jeder Zeitpunkt unabhängig verarbeitet (deaktiviert empfohlen; Aktivierung kann die Qualität stark verschlechtern).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'Dieser Schalter wird pro Engine gespeichert und wirkt derzeit nur auf die ausgewählte Engine.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': 'Nach dem Entfernen der Duplikate werden isolierte aufeinanderfolgende Noten der darunterliegenden Spur nach oben verschoben, um die Lücken zu füllen',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': 'Entfernt Noten mit gleichem Tick, Instrument und gleicher Tonhöhe; aktivieren Sie „Noten neu anordnen“, um isolierte aufeinanderfolgende Noten nach oben zu verschieben und die Lücken zu füllen',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': 'Keine doppelten Noten gefunden.\nKriterium: gleicher Tick + gleiches Instrument + gleiche Tonhöhe, Lautstärke wird ignoriert.',
        // 歌曲压缩
        '歌曲压缩': 'Song-Kompression', '压缩等级': 'Kompressionstufe', '算法模型': 'Algorithmus-Modell',
        '近乎无损': 'Nahezu verlustfrei', '高质量': 'Hohe Qualität', '中等质量': 'Mittlere Qualität', '较低质量': 'Niedrigere Qualität', '最低质量': 'Minimale Qualität',
        '压缩方式': 'Kompressionsmodus', '仅删除重复音符': 'Nur Duplikate entfernen', '使用压缩算法': 'Kompressionsalgorithmus verwenden',
        '轻度压缩': 'Leichte Kompression', '中度压缩': 'Mittlere Kompression', '较强压缩': 'Starke Kompression', '最强压缩': 'Maximale Kompression',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': 'Entfernt nur exakt doppelte Noten (gleicher Tick, gleiches Instrument, gleiche Tonhöhe); die Qualität bleibt nahezu unverändert.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': 'Entfernt zusätzlich zur Deduplizierung je nach Kompressionsstufe unauffällige Noten für eine höhere Kompressionsrate.',
        '只删除完全重复的音符，几乎不影响质量。': 'Entfernt nur exakt doppelte Noten; die Qualität bleibt nahezu unverändert.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': 'Entfernt unauffällige Noten in der gewählten Kompressionsstufe; Rate steigt und der Qualitätsverlust wächst mit der Stufe.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': 'Maximale Kompression: Noten können übermäßig entfernt werden, der Klang kann deutlich leiden',
        '务实启发式（快速）': 'Pragmatische Heuristik (schnell)', '感知引擎（智能）': 'Perzeptiver Motor (intelligent)',
        '压缩': 'Komprimieren', '歌曲太短，无法压缩': 'Song zu kurz zum Komprimieren', '未删除任何音符': 'Keine Noten entfernt',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': 'Minimale Qualität: Noten könnten übermäßig entfernt werden, der Klang kann deutlich leiden',
        '预计删除': 'Geschätzte Löschung', '保留': 'Behalten',
        '正在计算…': 'Berechne…', '正在压缩': 'Komprimiere…',
        '减轻处理的轨道': 'Spuren mit reduzierter Verarbeitung', '不被处理的轨道': 'Spuren ohne Verarbeitung',
        '选择': 'Auswählen', '未选择任何轨道': 'Keine Spuren ausgewählt',
        '选择减轻处理的轨道': 'Spuren mit reduzierter Verarbeitung auswählen',
        '选择不被处理的轨道': 'Spuren ohne Verarbeitung auswählen',
        '在画布中点击音轨行进行选择/取消，可多选。': 'Klicken Sie im Canvas auf Spurzeilen, um aus- oder abzuwählen. Mehrfachauswahl möglich.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': 'Die drei Modelle behalten unterschiedliche Noten; die Präsenz-Engine beurteilt nach physischer Hörbarkeit, am nächsten am tatsächlichen Klang.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': 'Pragmatische Heuristik (schnell): Bewertung nach einfachen Regeln (Grundton/Terz/Quinte, Oktav-Dubletten, Takt, Anschlagstärke, Dauer) — schnell und stabil.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': 'Perzeptive Engine (intelligent): Bewertung nach Stimmlage, Takt, Dauer, Anschlagstärke, Verdeckung und Perkussionsdichte — näher am Höreindruck, etwas langsamer.',
        '存在感引擎（物理）': 'Präsenz-Engine (physikalisch)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': 'Präsenz-Engine (physikalisch): löscht Noten nach ihrem tatsächlichen Hörbeitrag im Audio (Energiesumme, Verdeckungsfeld, Hörbarkeitsreserve) — ohne Abhängigkeit von der Tonalität, vorhersehbare Ergebnisse.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': 'Die Präsenz-Engine löscht nach physischer Hörbarkeit, am nächsten am tatsächlichen Klang — stabil auch bei chaotischen/atonalen Eingaben.',
    });
    Object.assign(UI_TEXT['fr-FR'], {
        '消除重复音符': 'Supprimer les notes en double', '没有可去重的音符': 'Aucune note à dédupliquer',
        '重排序音符': 'Réorganiser les notes',
        '合并并消除伪延音': 'Fusionner et supprimer le pseudo-sustain',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': 'Fusionne les notes répétées très proches en une note tenue et supprime les notes excédentaires. Désactivé, toutes les relations entre mesures sont ignorées et chaque instant est traité indépendamment (désactivé recommandé ; l’activer peut dégrader gravement la qualité).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': 'Ce commutateur est enregistré par moteur et n’affecte actuellement que le moteur sélectionné.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': 'Après suppression des doublons, les notes consécutives isolées de la piste adjacente inférieure remontent pour combler les vides',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': 'Supprime les notes ayant le même tick, instrument et hauteur ; activez « Réorganiser les notes » pour faire remonter les notes consécutives isolées et combler les vides',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': 'Aucune note en double trouvée.\nCritère : même tick + même instrument + même hauteur, la vélocité est ignorée.',
        // 歌曲压缩
        '歌曲压缩': 'Compression de chanson', '压缩等级': 'Niveau de compression', '算法模型': "Modèle d'algorithme",
        '近乎无损': 'Quasi sans perte', '高质量': 'Haute qualité', '中等质量': 'Qualité moyenne', '较低质量': 'Qualité inférieure', '最低质量': 'Qualité minimale',
        '压缩方式': 'Mode de compression', '仅删除重复音符': 'Supprimer uniquement les doublons', '使用压缩算法': "Utiliser l'algorithme de compression",
        '轻度压缩': 'Compression légère', '中度压缩': 'Compression moyenne', '较强压缩': 'Compression forte', '最强压缩': 'Compression maximale',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': 'Ne supprime que les notes exactement dupliquées (même tick, même instrument, même hauteur) ; la qualité reste quasiment intacte.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': 'Au-delà de la déduplication, supprime les notes peu perceptibles selon le niveau de compression pour un meilleur taux.',
        '只删除完全重复的音符，几乎不影响质量。': 'Ne supprime que les notes exactement dupliquées ; la qualité reste quasiment intacte.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': 'Supprime les notes peu perceptibles au niveau de compression choisi ; le taux augmente et la perte de qualité aussi.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': 'Compression maximale : des notes peuvent être supprimées à l’excès et le rendu peut être nettement dégradé',
        '务实启发式（快速）': 'Heuristique pragmatique (rapide)', '感知引擎（智能）': 'Moteur perceptuel (intelligent)',
        '压缩': 'Compresser', '歌曲太短，无法压缩': 'Chanson trop courte pour compression', '未删除任何音符': 'Aucune note supprimée',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': 'Qualité minimale : trop de notes risquent d\'être supprimées, le rendu peut être nettement dégradé',
        '预计删除': 'Suppression estimée', '保留': 'Conservées',
        '正在计算…': 'Calcul en cours…', '正在压缩': 'Compression en cours…',
        '减轻处理的轨道': 'Pistes à traitement réduit', '不被处理的轨道': 'Pistes non traitées',
        '选择': 'Sélectionner', '未选择任何轨道': 'Aucune piste sélectionnée',
        '选择减轻处理的轨道': 'Sélectionner les pistes à traitement réduit',
        '选择不被处理的轨道': 'Sélectionner les pistes non traitées',
        '在画布中点击音轨行进行选择/取消，可多选。': 'Cliquez sur les lignes de piste du canevas pour sélectionner ou désélectionner. Sélection multiple possible.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': 'Les trois moteurs conservent des notes différentes ; le moteur de présence juge par l’audibilité physique, au plus près de ce qui s’entend réellement.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': 'Heuristique pragmatique (rapide) : notation par règles simples (fondamentale/tierce/quinte, doublons d’octave, temps, vélocité, durée) — rapide et stable.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': 'Moteur perceptuel (intelligent) : notation par rôle de voix, temps, durée, vélocité, masquage et densité de percussions — plus proche de l’écoute, un peu plus lent.',
        '存在感引擎（物理）': 'Moteur de présence (physique)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': 'Moteur de présence (physique) : supprime les notes selon leur contribution réellement audible dans l’audio (somme d’énergie, champ de masquage, marge d’audibilité) — sans dépendance à la tonalité, résultats prévisibles.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': 'Le moteur de présence supprime selon l’audibilité physique, le plus proche de ce qu’on entend vraiment — stable même sur des entrées chaotiques/atonales.',
    });
    Object.assign(UI_TEXT['ko-KR'], {
        '消除重复音符': '중복 노트 제거', '没有可去重的音符': '중복 제거할 노트가 없습니다',
        '重排序音符': '노트 재정렬',
        '合并并消除伪延音': '의사 서스테인 병합 및 제거',
        '将间隔很近的重复音符合并为长音并删除多余音符。关闭后忽略一切跨小节关联，逐个时间点独立处理音符（推荐关闭，开启可能导致质量严重下降）。': '간격이 매우 가까운 반복 노트를 긴 음으로 병합하고 남는 노트를 제거합니다. 끄면 마디 간의 모든 연관을 무시하고 각 시점을 독립적으로 처리합니다 (끄는 것을 권장하며, 켜면 품질이 크게 저하될 수 있습니다).',
        '该开关针对每个引擎分别保存，当前仅作用于所选引擎。': '이 스위치는 엔진별로 저장되며 현재 선택한 엔진에만 적용됩니다.',
        '删除重复音符后，将下方相邻轨道中孤立的连续音符向上移动填补空洞': '중복 노트를 삭제한 뒤 아래 인접 트랙에서 고립된 연속 노트를 위로 이동해 빈 곳을 채웁니다',
        '删除同一时间中音色和音调完全相同的重复音符；勾选「重排序音符」可将删除后孤立的连续音符上移填补空洞': '같은 tick, 악기, 음높이의 중복 노트를 삭제합니다. "노트 재정렬"을 켜면 삭제 후 고립된 연속 노트를 위로 이동해 빈 곳을 채웁니다',
        '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。': '중복 노트를 찾지 못했습니다.\n기준: 같은 tick + 같은 악기 + 같은 음높이, 음량 차이는 무시.',
        // 歌曲压缩
        '歌曲压缩': '노래 압축', '压缩等级': '압축 수준', '算法模型': '알고리즘 모델',
        '近乎无损': '거의 무손실', '高质量': '고품질', '中等质量': '중간 품질', '较低质量': '낮은 품질', '最低质量': '최저 품질',
        '压缩方式': '압축 방식', '仅删除重复音符': '중복 음표만 삭제', '使用压缩算法': '압축 알고리즘 사용',
        '轻度压缩': '약한 압축', '中度压缩': '중간 압축', '较强压缩': '강한 압축', '最强压缩': '최대 압축',
        '只删除同一时间点、同一音色、同一音高完全重复的音符，几乎不影响质量。': '같은 시점·같은 악기·같은 음높이로 완전히 중복된 음표만 삭제하며 품질에는 거의 영향이 없습니다.',
        '在去重的基础上按「压缩等级」进一步删除存在感低的音符，压缩率更高。': '중복 제거에 더해 「압축 수준」에 따라 존재감이 낮은 음표를 삭제하여 압축률을 높입니다.',
        '只删除完全重复的音符，几乎不影响质量。': '완전히 중복된 음표만 삭제하며 품질에는 거의 영향이 없습니다.',
        '按所选「压缩等级」删除存在感低的音符，压缩率更高，质量损失随等级增加。': '선택한 「압축 수준」에서 존재감이 낮은 음표를 삭제합니다. 수준이 높을수록 압축률과 품질 손실이 커집니다.',
        '最强压缩：可能过度删除音符，歌曲听感可能明显受损': '최대 압축: 음표가 과도하게 삭제될 수 있고 곡의 청감이 크게 손상될 수 있습니다',
        '务实启发式（快速）': '실용적 휴리스틱 (빠름)', '感知引擎（智能）': '지각 엔진 (스마트)',
        '压缩': '압축', '歌曲太短，无法压缩': '노래가 너무 짧아 압축할 수 없습니다', '未删除任何音符': '삭제된 노트가 없습니다',
        '最低质量：可能过度删除音符，歌曲听感可能明显受损': '최저 품질: 노트가 과도하게 삭제되어 청감이 크게 손상될 수 있습니다',
        '预计删除': '예상 삭제', '保留': '유지',
        '正在计算…': '계산 중…', '正在压缩': '압축 중',
        '减轻处理的轨道': '축소 처리할 트랙', '不被处理的轨道': '처리하지 않을 트랙',
        '选择': '선택', '未选择任何轨道': '선택된 트랙 없음',
        '选择减轻处理的轨道': '축소 처리할 트랙 선택',
        '选择不被处理的轨道': '처리하지 않을 트랙 선택',
        '在画布中点击音轨行进行选择/取消，可多选。': '캔버스에서 트랙 행을 클릭해 선택/해제할 수 있습니다. 여러 개 선택 가능.',
        '三种模型删除策略不同，保留的音符互有差异；存在感引擎按物理可闻性判定，最贴近实际听感。': '세 엔진은 남기는 노트가 다릅니다. 존재감 엔진은 물리적 가청성으로 판단해 실제로 들리는 것에 가장 가깝습니다.',
        '务实启发式（快速）：按规则快速打分（根音/三音/五音、八度重复、节拍、力度、时值），速度快、结果稳定。': '실용적 휴리스틱(빠름): 규칙 기반 간단 채점(근음/3도/5도, 옥타브 중복, 박자, 벨로시티, 길이) — 빠르고 안정적.',
        '感知引擎（智能）：按声部角色、节拍、时值、力度、掩蔽与打击乐密度综合打分，更贴近听感，速度稍慢。': '지각 엔진(스마트): 성부 역할, 박자, 길이, 벨로시티, 마스킹, 타악기 밀도로 종합 채점 — 청감에 더 가깝지만 조금 느림.',
        '存在感引擎（物理）': '존재감 엔진 (물리)',
        '存在感引擎（物理）：按音符在合成音频中的实际可闻贡献（能量叠加、掩蔽场、可闻余量）判定删除，不依赖调性，结果可预测。': '존재감 엔진(물리): 합성 오디오에서 실제로 들리는 기여도(에너지 중첩, 마스킹 필드, 가청 여유)에 따라 노트를 삭제 — 조성 의존 없음, 예측 가능한 결과.',
        '存在感引擎按物理可闻性判定删除，最贴近实际听感，对混乱/无调性输入同样稳定。': '존재감 엔진은 물리적 가청성으로 삭제를 판단해 실제 청감에 가장 가깝습니다 — 혼란·무조성 입력에서도 안정적.',
    });

    // ============ 设置项文案 (八度数字 / 点击次数 / 方块名) 各语言补充 ============
    // 对应 index.html 三个设置 checkbox 的完整文本节点(整段文本作为 key)
    var _noteExtraI18n = {
        'en-US': {
            '音调文字显示八度数字': 'Keyboard labels show octave number',
            '音符上显示音符盒点击次数': 'Show note-block click count on notes',
            '音符上显示方块名': 'Show block name on notes'
        },
        'ja-JP': {
            '音调文字显示八度数字': '鍵盤ラベルにオクターブ数字を表示',
            '音符上显示音符盒点击次数': '音符に音符ブロックのクリック回数を表示',
            '音符上显示方块名': '音符にブロック名を表示'
        },
        'ko-KR': {
            '音调文字显示八度数字': '키보드 라벨에 옥타브 숫자 표시',
            '音符上显示音符盒点击次数': '노트에 노트 블록 클릭 횟수 표시',
            '音符上显示方块名': '노트에 블록 이름 표시'
        },
        'pt-BR': {
            '音调文字显示八度数字': 'Rótulos do teclado mostram o número da oitava',
            '音符上显示音符盒点击次数': 'Mostrar o número de cliques do bloco musical nas notas',
            '音符上显示方块名': 'Mostrar o nome do bloco nas notas'
        },
        'id-ID': {
            '音调文字显示八度数字': 'Label keyboard menampilkan angka oktaf',
            '音符上显示音符盒点击次数': 'Tampilkan jumlah klik blok nada pada not',
            '音符上显示方块名': 'Tampilkan nama blok pada not'
        },
        'es-ES': {
            '音调文字显示八度数字': 'Las etiquetas del teclado muestran el número de octava',
            '音符上显示音符盒点击次数': 'Mostrar el número de clics del bloque musical en las notas',
            '音符上显示方块名': 'Mostrar el nombre del bloque en las notas'
        },
        'ru-RU': {
            '音调文字显示八度数字': 'Показывать октаву на подписях клавиш',
            '音符上显示音符盒点击次数': 'Показывать количество кликов музыкального блока на нотах',
            '音符上显示方块名': 'Показывать название блока на нотах'
        },
        'de-DE': {
            '音调文字显示八度数字': 'Tastaturbeschriftungen zeigen Oktavnummer',
            '音符上显示音符盒点击次数': 'Klickanzahl des Notenblocks auf Noten anzeigen',
            '音符上显示方块名': 'Blocknamen auf Noten anzeigen'
        },
        'fr-FR': {
            '音调文字显示八度数字': 'Les libellés du clavier affichent l\'octave',
            '音符上显示音符盒点击次数': 'Afficher le nombre de clics du bloc de notes sur les notes',
            '音符上显示方块名': 'Afficher le nom du bloc sur les notes'
        }
    };
    var _nl;
    for (_nl in _noteExtraI18n) {
        if (Object.prototype.hasOwnProperty.call(_noteExtraI18n, _nl)) Object.assign(UI_TEXT[_nl], _noteExtraI18n[_nl]);
    }

    // ============ 设置弹窗补充词条 (es/ru/de/fr/ko) 完整补齐 ============
    // 对应 index.html 设置弹窗 ($settings-popup) 静态文本节点(整段文本作为 key)。
    // 这些词条在 en/ja 已有译文，其余语言缺失，此处补齐。
    var _settingsExtraI18n = {
        'es-ES': {
            '平滑翻页 (播放头居中)': 'Desplazamiento suave (reproducción centrada)',
            '音符播放高亮动画': 'Animación de resaltado de notas al reproducir',
            '录制时显示音符动画 (关闭可提升录制性能)': 'Mostrar animación de notas al grabar (desactivar mejora el rendimiento de grabación)',
            '音效优化 (混响/立体声)': 'Mejora de audio (reverb/estéreo)',
            '音符音量透明度 (音量越低越透明)': 'Transparencia del volumen de las notas (menor volumen = más transparente)',
            'NBS 导出版本:': 'Versión de exportación NBS:',
            '含铜号角乐器时自动 V6': 'Usar V6 automáticamente con instrumentos de cuerno de cobre',
            '关于 NoteBlockWeb': 'Acerca de NoteBlockWeb',
            '通用': 'General', '个性化': 'Personalización', '清除': 'Borrar', '平铺': 'Mosaico', '拉伸': 'Estirar',
            '缩放适配': 'Ajustar escala', '普通半透明': 'Semitransparente normal', '毛玻璃': 'Vidrio esmerilado', '亚克力': 'Acrílico',
            '背景图片:': 'Imagen de fondo:', '背景透明度:': 'Transparencia de fondo:', '背景模式:': 'Modo de fondo:',
            '表面材质:': 'Material de superficie:', '面板透明度:': 'Transparencia del panel:', '音轨栏透明度:': 'Transparencia del panel de pistas:',
            '网格材质:': 'Material de la cuadrícula:', '网格透明度:': 'Transparencia de la cuadrícula:',
            '播放时询问': 'Preguntar al reproducir', '自动后台下载': 'Descarga automática en segundo plano',
            '不使用 (内置合成器)': 'Desactivado (sintetizador integrado)', 'MIDI 音色库:': 'Banco de sonidos MIDI:',
            '未下载': 'No descargado', '立即下载': 'Descargar ahora', '清除缓存': 'Borrar caché', '音色库状态:': 'Estado del banco de sonidos:',
            '语言': 'Idioma',
            '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'Sugerencia: la imagen de fondo cubre toda la página; 100 % de transparencia = totalmente transparente, 0 % = opaco. El material de superficie controla la barra de herramientas; el material de la cuadrícula controla solo la zona de la cuadrícula de notas. La transparencia del panel controla la opacidad de la barra de herramientas, y la transparencia del panel de pistas controla la barra de información de pistas de la izquierda.'
        },
        'ru-RU': {
            '平滑翻页 (播放头居中)': 'Плавное следование (плейхед по центру)',
            '音符播放高亮动画': 'Анимация подсветки нот при воспроизведении',
            '录制时显示音符动画 (关闭可提升录制性能)': 'Показывать анимацию нот при записи (отключение повышает производительность записи)',
            '音效优化 (混响/立体声)': 'Улучшение звука (реверберация/стерео)',
            '音符音量透明度 (音量越低越透明)': 'Прозрачность по громкости ноты (тише = прозрачнее)',
            'NBS 导出版本:': 'Версия экспорта NBS:',
            '含铜号角乐器时自动 V6': 'Автоматически переключаться на V6 при наличии медных горнов',
            '关于 NoteBlockWeb': 'О NoteBlockWeb',
            '通用': 'Общие', '个性化': 'Персонализация', '清除': 'Очистить', '平铺': 'Замостить', '拉伸': 'Растянуть',
            '缩放适配': 'Вписать по размеру', '普通半透明': 'Обычный полупрозрачный', '毛玻璃': 'Матовое стекло', '亚克力': 'Акрил',
            '背景图片:': 'Фоновая картинка:', '背景透明度:': 'Прозрачность фона:', '背景模式:': 'Режим фона:',
            '表面材质:': 'Материал поверхности:', '面板透明度:': 'Прозрачность панели:', '音轨栏透明度:': 'Прозрачность панели дорожек:',
            '网格材质:': 'Материал сетки:', '网格透明度:': 'Прозрачность сетки:',
            '播放时询问': 'Спрашивать при воспроизведении', '自动后台下载': 'Автоскачивание в фоне',
            '不使用 (内置合成器)': 'Не использовать (встроенный синтезатор)', 'MIDI 音色库:': 'MIDI-звуковые банки:',
            '未下载': 'Не загружено', '立即下载': 'Скачать сейчас', '清除缓存': 'Очистить кэш', '音色库状态:': 'Состояние звукового банка:',
            '语言': 'Язык',
            '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'Подсказка: фоновая картинка покрывает всю страницу; прозрачность 100 % — полностью прозрачно, 0 % — непрозрачно; материал поверхности управляет панелью инструментов, материал сетки отдельно управляет областью нотной сетки; прозрачность панели управляет степенью прозрачности панели инструментов, а прозрачность панели дорожек отдельно управляет левой информационной панелью дорожек.'
        },
        'de-DE': {
            '平滑翻页 (播放头居中)': 'Sanftes Scrollen (Wiedergabekopf mittig)',
            '音符播放高亮动画': 'Noten-Highlight-Animation bei der Wiedergabe',
            '录制时显示音符动画 (关闭可提升录制性能)': 'Notenanimation während der Aufnahme anzeigen (deaktivieren verbessert Aufnahmeleistung)',
            '音效优化 (混响/立体声)': 'Audioverbesserung (Hall/Stereo)',
            '音符音量透明度 (音量越低越透明)': 'Notentransparenz nach Lautstärke (leiser = transparenter)',
            'NBS 导出版本:': 'NBS-Exportversion:',
            '含铜号角乐器时自动 V6': 'Automatisch V6 bei Kupferhorn-Instrumenten verwenden',
            '关于 NoteBlockWeb': 'Über NoteBlockWeb',
            '通用': 'Allgemein', '个性化': 'Personalisierung', '清除': 'Löschen', '平铺': 'Kacheln', '拉伸': 'Strecken',
            '缩放适配': 'Skalieren', '普通半透明': 'Normales halbtransparentes', '毛玻璃': 'Mattglas', '亚克力': 'Acryl',
            '背景图片:': 'Hintergrundbild:', '背景透明度:': 'Hintergrundtransparenz:', '背景模式:': 'Hintergrundmodus:',
            '表面材质:': 'Oberflächenmaterial:', '面板透明度:': 'Transparenz des Bedienfelds:', '音轨栏透明度:': 'Transparenz der Spurspalte:',
            '网格材质:': 'Rastermaterial:', '网格透明度:': 'Rastertransparenz:',
            '播放时询问': 'Beim Abspielen fragen', '自动后台下载': 'Automatischer Hintergrunddownload',
            '不使用 (内置合成器)': 'Deaktiviert (integrierter Synthesizer)', 'MIDI 音色库:': 'MIDI-Soundfont:',
            '未下载': 'Nicht heruntergeladen', '立即下载': 'Jetzt herunterladen', '清除缓存': 'Cache löschen', '音色库状态:': 'Soundfont-Status:',
            '语言': 'Sprache',
            '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'Tipp: Das Hintergrundbild bedeckt die gesamte Seite. 100 % Transparenz = vollständig transparent, 0 % = undurchsichtig. Das Oberflächenmaterial steuert die Werkzeugleiste; das Rastermaterial steuert den Notenrasterbereich. Die Transparenz des Bedienfelds steuert die Deckkraft der Werkzeugleiste; die Transparenz der Spurspalte steuert die linke Spurinformationsleiste.'
        },
        'fr-FR': {
            '平滑翻页 (播放头居中)': 'Défilement fluide (curseur de lecture centré)',
            '音符播放高亮动画': 'Animation de surbrillance des notes à la lecture',
            '录制时显示音符动画 (关闭可提升录制性能)': 'Afficher l’animation des notes à l’enregistrement (désactiver améliore les performances)',
            '音效优化 (混响/立体声)': 'Amélioration audio (réverb/stéréo)',
            '音符音量透明度 (音量越低越透明)': 'Transparence du volume des notes (volume plus bas = plus transparent)',
            'NBS 导出版本:': 'Version d’exportation NBS :',
            '含铜号角乐器时自动 V6': 'Utiliser V6 automatiquement avec les instruments à cor de cuivre',
            '关于 NoteBlockWeb': 'À propos de NoteBlockWeb',
            '通用': 'Général', '个性化': 'Personnalisation', '清除': 'Effacer', '平铺': 'Mosaïque', '拉伸': 'Étirer',
            '缩放适配': 'Ajuster à l’échelle', '普通半透明': 'Semi-transparent normal', '毛玻璃': 'Verre dépoli', '亚克力': 'Acrylique',
            '背景图片:': 'Image de fond :', '背景透明度:': 'Transparence du fond :', '背景模式:': 'Mode de fond :',
            '表面材质:': 'Matériau de surface :', '面板透明度:': 'Transparence du panneau :', '音轨栏透明度:': 'Transparence de la colonne des pistes :',
            '网格材质:': 'Matériau de la grille :', '网格透明度:': 'Transparence de la grille :',
            '播放时询问': 'Demander à la lecture', '自动后台下载': 'Téléchargement automatique en arrière-plan',
            '不使用 (内置合成器)': 'Désactivé (synthétiseur intégré)', 'MIDI 音色库:': 'Banque de sons MIDI :',
            '未下载': 'Non téléchargé', '立即下载': 'Télécharger maintenant', '清除缓存': 'Vider le cache', '音色库状态:': 'État de la banque de sons :',
            '语言': 'Langue',
            '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'Astuce : l’image de fond couvre toute la page. Transparence 100 % = totalement transparent, 0 % = opaque. Le matériau de surface contrôle la barre d’outils ; le matériau de la grille contrôle séparément la zone de la grille de notes. La transparence du panneau contrôle l’opacité de la barre d’outils, et la transparence de la colonne des pistes contrôle la barre d’informations des pistes à gauche.'
        },
        'ko-KR': {
            '平滑翻页 (播放头居中)': '부드러운 이동 (재생 헤드 중앙)',
            '音符播放高亮动画': '재생 시 노트 강조 애니메이션',
            '录制时显示音符动画 (关闭可提升录制性能)': '녹음 시 노트 애니메이션 표시 (끄면 녹음 성능 향상)',
            '音效优化 (混响/立体声)': '오디오 강화 (리버브/스테레오)',
            '音符音量透明度 (音量越低越透明)': '노트 음량 투명도 (음량이 낮을수록 투명)',
            'NBS 导出版本:': 'NBS 내보내기 버전:',
            '含铜号角乐器时自动 V6': '구리 호른 악기가 있으면 자동으로 V6 사용',
            '关于 NoteBlockWeb': 'NoteBlockWeb 정보',
            '通用': '일반', '个性化': '개인화', '清除': '지우기', '平铺': '바둑판식 반복', '拉伸': '늘리기',
            '缩放适配': '크기에 맞춤', '普通半透明': '일반 반투명', '毛玻璃': '매트 글라스', '亚克力': '아크릴',
            '背景图片:': '배경 이미지:', '背景透明度:': '배경 투명도:', '背景模式:': '배경 모드:',
            '表面材质:': '표면 재질:', '面板透明度:': '패널 투명도:', '音轨栏透明度:': '트랙 표시줄 투명도:',
            '网格材质:': '그리드 재질:', '网格透明度:': '그리드 투명도:',
            '播放时询问': '재생할 때 확인', '自动后台下载': '자동 백그라운드 다운로드',
            '不使用 (内置合成器)': '사용 안 함 (내장 신디사이저)', 'MIDI 音色库:': 'MIDI 사운드폰트:',
            '未下载': '미다운로드', '立即下载': '지금 다운로드', '清除缓存': '캐시 지우기', '音色库状态:': '사운드폰트 상태:',
            '语言': '언어',
            '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': '팁: 배경 이미지는 전체 페이지를 덮습니다. 투명도 100%이면 완전 투명, 0%이면 불투명입니다. 표면 재질은 툴바를 제어하고, 그리드 재질은 노트 그리드 영역을 별도로 제어합니다. 패널 투명도는 툴바의 투명도를, 트랙 표시줄 투명도는 왼쪽 트랙 정보 표시줄을 별도로 제어합니다.'
        },
        'pt-BR': {
            '通用': 'Geral', '个性化': 'Personalização', '清除': 'Limpar', '平铺': 'Lado a lado', '拉伸': 'Esticar',
            '缩放适配': 'Ajustar escala', '普通半透明': 'Semitransparente comum', '毛玻璃': 'Vidro fosco', '亚克力': 'Acrílico',
            '背景图片:': 'Imagem de fundo:', '背景透明度:': 'Transparência do fundo:', '背景模式:': 'Modo de fundo:',
            '表面材质:': 'Material da superfície:', '面板透明度:': 'Transparência do painel:', '音轨栏透明度:': 'Transparência da coluna de faixas:',
            '网格材质:': 'Material da grade:', '网格透明度:': 'Transparência da grade:',
            '播放时询问': 'Perguntar ao reproduzir', '自动后台下载': 'Download automático em segundo plano',
            '不使用 (内置合成器)': 'Desativado (sintetizador integrado)', 'MIDI 音色库:': 'Banco de sons MIDI:',
            '未下载': 'Não baixado', '立即下载': 'Baixar agora', '清除缓存': 'Limpar cache', '音色库状态:': 'Estado do banco de sons:',
            '音符音量透明度 (音量越低越透明)': 'Transparência do volume das notas (volume menor = mais transparente)',
            '语言': 'Idioma',
            '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'Dica: a imagem de fundo cobre a página inteira. Transparência 100% = totalmente transparente, 0% = opaco. O material da superfície controla a barra de ferramentas; o material da grade controla separadamente a área da grade de notas. A transparência do painel controla a opacidade da barra de ferramentas e a transparência da coluna de faixas controla a barra de informações de faixas à esquerda.'
        },
        'id-ID': {
            '通用': 'Umum', '个性化': 'Personalisasi', '清除': 'Bersihkan', '平铺': 'Berpetak', '拉伸': 'Regangkan',
            '缩放适配': 'Sesuaikan ukuran', '普通半透明': 'Biasa semi-transparan', '毛玻璃': 'Kaca buram', '亚克力': 'Akrilik',
            '背景图片:': 'Gambar latar:', '背景透明度:': 'Transparansi latar:', '背景模式:': 'Mode latar:',
            '表面材质:': 'Material permukaan:', '面板透明度:': 'Transparansi panel:', '音轨栏透明度:': 'Transparansi kolom track:',
            '网格材质:': 'Material grid:', '网格透明度:': 'Transparansi grid:',
            '播放时询问': 'Tanyakan saat memutar', '自动后台下载': 'Unduhan latar otomatis',
            '不使用 (内置合成器)': 'Tidak digunakan (sintesis bawaan)', 'MIDI 音色库:': 'Bank suara MIDI:',
            '未下载': 'Belum diunduh', '立即下载': 'Unduh sekarang', '清除缓存': 'Bersihkan cache', '音色库状态:': 'Status bank suara:',
            '音符音量透明度 (音量越低越透明)': 'Transparansi volume not (volume lebih rendah = lebih transparan)',
            '语言': 'Bahasa',
            '提示: 背景图片覆盖整个网页; 透明度 100% 完全透明, 0% 不透明; 表面材质控制工具栏, 网格材质单独控制音符网格区域; 面板透明度控制工具栏透明程度, 音轨栏透明度单独控制左侧音轨信息栏': 'Tips: gambar latar menutupi seluruh halaman. Transparansi 100% = transparan penuh, 0% = tidak transparan. Material permukaan mengontrol toolbar; material grid mengontrol area grid not secara terpisah. Transparansi panel mengontrol tingkat transparansi toolbar, dan transparansi kolom track mengontrol bilah info track di kiri.'
        }
    };
    for (_nl in _settingsExtraI18n) {
        if (Object.prototype.hasOwnProperty.call(_settingsExtraI18n, _nl)) Object.assign(UI_TEXT[_nl], _settingsExtraI18n[_nl]);
    }

    window.WebNBSI18n = { init: init, apply: apply, getLocale: function() { return current; }, t: t, translate: translate, supported: SUPPORTED.slice() };
})();

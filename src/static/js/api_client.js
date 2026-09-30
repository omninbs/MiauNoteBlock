/**
 * MiauNoteBlock API 客户端
 */

// 统一格式化后端返回的错误，避免 Error.message 变成 [object Object]
function formatApiError(err, fallback) {
    fallback = fallback || '请求失败';
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || fallback;
    if (err.detail && typeof err.detail === 'string') return err.detail;
    if (err.message && typeof err.message === 'string') return err.message;
    if (err.error && typeof err.error === 'string') return err.error;
    try {
        var json = JSON.stringify(err);
        if (json && json !== '{}') return json;
    } catch (e) {}
    return fallback;
}

const API = {
    baseUrl: '',

    // 获取乐器列表
    async getInstruments() {
        const response = await fetch(`${this.baseUrl}/api/instruments`);
        return response.json();
    },

    // 加载 NBS 文件（客户端解析，带进度回调）
    loadSong: function(file, onProgress) {
        return new Promise(function(resolve, reject) {
            var startTime = Date.now();
            var reader = new FileReader();
            reader.onprogress = function(e) {
                if (e.lengthComputable && onProgress) {
                    var now = Date.now();
                    var elapsed = Math.max(1, now - startTime) / 1000;
                    var speed = e.loaded / elapsed;
                    var eta = speed > 0 ? (e.total - e.loaded) / speed : 0;
                    onProgress(e.loaded, e.total, speed, Math.round(e.loaded / e.total * 100), eta);
                }
            };
            reader.onload = function(e) {
                try {
                    var song = NBSClient._parseNBS(e.target.result);
                    if (onProgress) onProgress(file.size, file.size, 0, 100, 0);
                    resolve({ success: true, song: song });
                } catch(err) {
                    reject(new Error('加载NBS文件失败: ' + (err.message || err)));
                }
            };
            reader.onerror = function() { reject(new Error('读取文件失败')); };
            reader.readAsArrayBuffer(file);
        });
    },

    // 保存/导出 NBS 文件（客户端生成二进制，直接返回 Blob URL）
    // onProgress(loaded, total, speed, percent, eta, phase)
    saveSong: function(song, onProgress) {
        return new Promise(function(resolve, reject) {
            try {
                if (onProgress) onProgress(0, 0, 0, 15, 0, 'parse');
                var songData = {
                    name: song.name || song.song_name || 'Untitled',
                    author: song.author || '',
                    original_author: song.original_author || '',
                    description: song.description || '',
                    tempo: song.tempo || 20,
                    time_signature: song.time_signature || 4,
                    auto_save: song.auto_save || false,
                    auto_save_minutes: song.auto_save_minutes || 0,
                    loop: song.loop || 0,
                    max_loop_count: song.max_loop_count || 0,
                    loop_start: song.loop_start || 0,
                    notes: (song.notes || []).map(function(n) {
                        return {
                            tick: (n.tick !== undefined && n.tick !== null) ? n.tick : 0,
                            layer: (n.layer !== undefined && n.layer !== null) ? n.layer : 0,
                            instrument: (n.instrument !== undefined && n.instrument !== null) ? n.instrument : 0,
                            key: (n.key !== undefined && n.key !== null) ? n.key : 33,
                            velocity: (n.velocity !== undefined && n.velocity !== null) ? n.velocity : 100,
                            pan: (n.pan !== undefined && n.pan !== null) ? n.pan : 50,
                            pitch: (n.pitch !== undefined && n.pitch !== null) ? n.pitch : 0
                        };
                    }),
                    layers: (song.layers || []).map(function(l, i) {
                        return {
                            name: l.name || ('Layer ' + (i + 1)),
                            volume: (l.volume !== undefined && l.volume !== null) ? l.volume : 100,
                            stereo: (l.stereo !== undefined && l.stereo !== null) ? l.stereo : 100,
                            lock: (l.lock !== undefined && l.lock !== null) ? l.lock : 0
                        };
                    }),
                    customInstruments: song.customInstruments || []
                };
                if (onProgress) onProgress(0, 0, 0, 50, 0, 'process');
                var nbsBytes = NBSClient._writeNBS(songData);
                if (onProgress) onProgress(0, 0, 0, 90, 0, 'complete');
                var blob = new Blob([nbsBytes], { type: 'application/octet-stream' });
                var url = URL.createObjectURL(blob);
                if (onProgress) onProgress(0, 0, 0, 100, 0, 'done');
                resolve({
                    downloadUrl: url,
                    filename: (songData.name || 'Untitled') + '.nbs',
                    size: nbsBytes.length
                });
            } catch(err) {
                reject(new Error('导出NBS失败: ' + (err.message || err)));
            }
        });
    },

    // 获取歌曲信息
    async getSongInfo() {
        const response = await fetch(`${this.baseUrl}/api/song/info`);
        return response.json();
    },

    // 导入 MIDI（客户端解析，带进度回调）
    importMidi: function(file, settings, onProgress) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    if (onProgress) onProgress(file.size, file.size, 0, 50, 0);
                    var song = NBSClient._convertMidiToNBS(e.target.result, settings || {});
                    if (onProgress) onProgress(file.size, file.size, 0, 100, 0);
                    resolve({ success: true, song: song, suggested_tempo: song.tempo });
                } catch(err) {
                    reject(new Error('导入MIDI失败: ' + (err.message || err)));
                }
            };
            reader.onerror = function() { reject(new Error('读取文件失败')); };
            reader.readAsArrayBuffer(file);
        });
    },

    // 获取 MIDI 文件信息（客户端解析，不导入）
    getMidiInfo: function(file, onProgress) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    if (onProgress) onProgress(file.size, file.size, 0, 100, 0);
                    var info = NBSClient._parseMidiInfo(e.target.result);
                    resolve({ success: true, info: info });
                } catch(err) {
                    reject(new Error('读取MIDI信息失败: ' + (err.message || err)));
                }
            };
            reader.onerror = function() { reject(new Error('读取文件失败')); };
            reader.readAsArrayBuffer(file);
        });
    },

    // 获取所有音符
    async getNotes() {
        const response = await fetch(`${this.baseUrl}/api/notes`);
        return response.json();
    },

    // 添加音符
    async addNote(note) {
        const response = await fetch(`${this.baseUrl}/api/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(note)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(data, '添加音符失败'));
        }
        return data;
    },

    // 更新音符
    async updateNote(noteId, update) {
        const response = await fetch(`${this.baseUrl}/api/notes/${noteId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(update)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || '更新音符失败');
        }
        return data;
    },

    // 删除音符
    async deleteNote(noteId) {
        const response = await fetch(`${this.baseUrl}/api/notes/${noteId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || '删除音符失败');
        }
        return response.json();
    },

    // 批量操作
    async batchOperation(operation) {
        const response = await fetch(`${this.baseUrl}/api/notes/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(operation)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || '批量操作失败');
        }
        return data;
    },

    // 播放
    async play(startTick = 0) {
        const response = await fetch(`${this.baseUrl}/api/play?start_tick=${startTick}`, {
            method: 'POST'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(data, '播放失败'));
        }
        return data;
    },

    // 暂停
    async pause() {
        const response = await fetch(`${this.baseUrl}/api/pause`, {
            method: 'POST'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(data, '暂停失败'));
        }
        return data;
    },

    // 停止
    async stop() {
        const response = await fetch(`${this.baseUrl}/api/stop`, {
            method: 'POST'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(data, '停止失败'));
        }
        return data;
    },

    // 设置速度
    async setTempo(tempo) {
        const response = await fetch(`${this.baseUrl}/api/tempo`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tempo })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(data, '设置速度失败'));
        }
        return data;
    },

    // 获取播放状态
    async getPlaybackStatus() {
        const response = await fetch(`${this.baseUrl}/api/playback/status`);
        return response.json();
    }
};

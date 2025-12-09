// === SISTEMA DE FILE LOCKING PARA MÚLTIPLAS INSTÂNCIAS ===
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');

class FileLock {
    constructor(lockDir = './.locks') {
        this.lockDir = lockDir;
        this.locks = new Map();
        this.initLockDir();
    }

    async initLockDir() {
        try {
            await fs.mkdir(this.lockDir, { recursive: true });
        } catch (err) {
            // Já existe
        }
    }

    async acquireLock(fileName, timeout = 10000) {
        const lockFile = path.join(this.lockDir, `${fileName}.lock`);
        const startTime = Date.now();
        const instanceId = process.env.BOT_INSTANCE || 'main';

        while (Date.now() - startTime < timeout) {
            try {
                // Tenta criar arquivo de lock (exclusivo)
                await fs.writeFile(lockFile, instanceId, { flag: 'wx' });
                this.locks.set(fileName, lockFile);
                return true;
            } catch (err) {
                // Lock já existe, espera um pouco
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        throw new Error(`Timeout ao adquirir lock para ${fileName}`);
    }

    async releaseLock(fileName) {
        const lockFile = this.locks.get(fileName);
        if (lockFile) {
            try {
                await fs.unlink(lockFile);
                this.locks.delete(fileName);
            } catch (err) {
                // Lock já foi removido
            }
        }
    }

    async withLock(fileName, callback) {
        await this.acquireLock(fileName);
        try {
            return await callback();
        } finally {
            await this.releaseLock(fileName);
        }
    }
}

module.exports = new FileLock();

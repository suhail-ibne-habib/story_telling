const path = require("path");
const fs = require("fs");

const StorageService = require("../../storage/StorageService");
const FFmpegService = require("./FFmpegService");
const FFprobeService = require("./FFprobeService");
const GetFileName = require("../core/GetFileName");

class DownsampleService {

    proxyPath(jobId) {
        return StorageService.getProxyMovie(jobId);
    }

    async loadMetadata(jobId) {
        const metadataPath = path.join(
            StorageService.getPaths(jobId).metadata,
            "meta_data.json"
        );

        if (!fs.existsSync(metadataPath)) {
            throw new Error(
                `meta_data.json not found: ${metadataPath}`
            );
        }

        return JSON.parse(
            await fs.promises.readFile(metadataPath, "utf-8")
        );
    }

    async downsample(jobId) {
        const filename = await GetFileName.getFileName(jobId);
        const inputPath = StorageService.getInputMovie(filename);

        if (!fs.existsSync(inputPath)) {
            throw new Error(
                `Input movie not found: ${inputPath}`
            );
        }

        const metadata = await this.loadMetadata(jobId);
        const outputPath = this.proxyPath(jobId);
        const hasAudio = Boolean(metadata.audio);

        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

        console.log(
            `[Downsample] Encoding 480p proxy${hasAudio ? " with thin audio" : " (video only)"}`
        );

        await FFmpegService.downsampleTo480p({
            inputPath,
            outputPath,
            hasAudio
        });

        if (!fs.existsSync(outputPath)) {
            throw new Error(
                `Proxy was not created: ${outputPath}`
            );
        }

        const proxyMeta = await FFprobeService.extract(outputPath);

        return {
            inputPath,
            outputPath,
            originalDuration: metadata.duration,
            originalSize: metadata.size,
            proxySize: proxyMeta.size,
            proxyDuration: proxyMeta.duration,
            width: proxyMeta.video?.width || null,
            height: proxyMeta.video?.height || null
        };
    }

}

module.exports = new DownsampleService();

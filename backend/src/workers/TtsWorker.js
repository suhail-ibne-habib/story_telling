const events = require("../events/events");
const STAGES = require("../constance/pipelineStages");
const VoiceoverService = require("../services/VoiceoverService");
const { subscribeStage } = require("./subscribeStage");

subscribeStage({
    name: "TTS",
    event: events.RECAP_COMPLETED,
    failEvent: events.TTS_FAILED,
    stage: STAGES.TTS,
    nextEvent: events.TTS_COMPLETED,
    isDone: async (jobId) => VoiceoverService.isDone(jobId),
    run: async (jobId) => {
        const results = await VoiceoverService.synthesize(jobId);
        results.forEach((voice) => {
            const total = voice.beats.reduce((sum, beat) => sum + beat.duration_sec, 0);
            console.log(
                `[TTS] ${voice.angle}: ${voice.beats.length} beats, ${total.toFixed(1)}s voice`
            );
        });
    }
});

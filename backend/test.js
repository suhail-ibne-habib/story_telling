const ShotDetectionService = require('./src/services/ShotDetectionService')

const show = async () => {

    const result = await ShotDetectionService.buildShots([
        6.133,
        7.3,
        8.4,
        8.5,
        9.7
    ], 10)

    console.log(result)

}

show()
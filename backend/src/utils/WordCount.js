class WordCount {

    static count(text) {

        if (!text || typeof text !== "string") {
            return 0;
        }

        return text
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .length;

    }

}

module.exports = WordCount;
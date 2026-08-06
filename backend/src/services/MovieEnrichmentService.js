class MovieEnrichmentService {
    constructor() {
        this.baseUrl = "https://api.themoviedb.org/3";
        this.imageBaseUrl = "https://image.tmdb.org/t/p/w500";
        this.token = process.env.TMDB_API_READ_ACCESS_TOKEN;
    }

    async enrich(movieId) {
        const movie = await this.fetchMovie(movieId)
        const credits = await this.fetchCredits(movieId)
        const characters = this.buildCharacters(credits.cast)

        console.log("TMDB MOVIE CHECK:", {
            id: movie?.id,
            title: movie?.title,
            hasGenres: Array.isArray(movie?.genres),
            genres: movie?.genres,
            statusCode: movie?.status_code,
            statusMessage: movie?.status_message
        });

        console.log("TMDB CREDITS CHECK:", {
            hasCast: Array.isArray(credits?.cast),
            castCount: credits?.cast?.length
        });

        return {
            movie: {
                externalId: movie.id,
                title: movie?.title,
                originalTitle: movie.original_title,
                year: this.getYear(
                    movie.release_date
                ),
                overview: movie.overview,
                genres: movie?.genres.map(
                    genre => genre.name
                )
            },

            characters
        }
    }

    async fetchMovie(movieId) {
        return this.request(
            `/movie/${movieId}`
        );
    }

    async fetchCredits(movieId) {
        return this.request(
            `/movie/${movieId}/credits`
        );
    }

    async request(endpoint) {
        if (!this.token) {
            throw new Error("TMDB_ACCESS_TOKEN is missing")
        }

        const response = await fetch(
            `${this.baseUrl}${endpoint}`,
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    Accept: 'application/json'
                }
            }
        )

        if (!response.ok) {
            throw new Error(`TMDB request failed: ${response.status}`)
        }

        return response.json();
    }

    buildCharacters(cast) {
        return cast.filter(castMember => {
            return (
                castMember.character && castMember.name
            )
        })
            .slice(0, 20)
            .map((castMember, index) => {
                return {
                    id: `C${index + 1}`,
                    name: castMember.character,
                    actorName: castMember.name,
                    description: null,
                    referenceImage: this.buildReferenceImages(
                        castMember
                    ),
                    external: {
                        source: 'tmdb',
                        castId: castMember.cast_id,
                        personalId: castMember.id
                    }
                }
            })
    }

    buildReferenceImages(castMember) {
        if (!castMember.profile_path) {
            return []
        }

        return [
            {
                id: 'R1',
                source: "tmdb",
                url: `${this.imageBaseUrl}${castMember.profile_path}`
            }
        ]
    }

    getYear(releaseDate) {
        if (!releaseDate) {
            return null;
        }

        return Number(
            releaseDate.slice(0, 4)
        )
    }
}

module.exports = new MovieEnrichmentService();
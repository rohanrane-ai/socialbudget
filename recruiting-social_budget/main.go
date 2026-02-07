package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"go-backend-react-frontend/backend"

	"github.com/gin-gonic/gin"
)

//go:generate sh -c "cd frontend && npm install && npm run build"
//go:embed frontend/dist
var frontendFS embed.FS

func main() {
	r := gin.Default()

	server, err := backend.NewServer("backend/data")
	if err != nil {
		log.Fatal(err)
	}
	server.RegisterRoutes(r)

	// Serve embedded frontend in production, or proxy to Vite in dev
	if os.Getenv("ENV") == "dev" {
		// In dev mode, frontend runs separately on Vite
		log.Println("Running in dev mode - frontend should be served by Vite on :3000")
	} else {
		// Serve embedded frontend
		distFS, err := fs.Sub(frontendFS, "frontend/dist")
		if err != nil {
			log.Fatal(err)
		}
		r.NoRoute(func(c *gin.Context) {
			c.FileFromFS(c.Request.URL.Path, http.FS(distFS))
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}

	log.Printf("Server starting on port %s\n", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

module.exports = {
  "content": [
    "./index.html",
    "./app.js"
  ],
  "theme": {
    "extend": {
      "fontFamily": {
        "sans": [
          "\"Noto Sans TC\"",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      },
      "colors": {
        "brand": {
          "red": "#d93025",
          "darkRed": "#b92b1b",
          "light": "#fff1f0",
          "green": "#188038",
          "darkGreen": "#12662d"
        }
      },
      "animation": {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "slide-up": "slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite"
      },
      "keyframes": {
        "fadeIn": {
          "0%": {
            "opacity": "0"
          },
          "100%": {
            "opacity": "1"
          }
        },
        "slideUp": {
          "0%": {
            "opacity": "0",
            "transform": "translateY(20px)"
          },
          "100%": {
            "opacity": "1",
            "transform": "translateY(0)"
          }
        }
      },
      "boxShadow": {
        "soft": "0 10px 40px -10px rgba(0,0,0,0.08)",
        "glow": "0 0 20px rgba(217, 48, 37, 0.3)"
      }
    }
  }
};

# Private Setup Instructions - Desktop Doc

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/merveyilmaz/desktop-doc.git
cd desktop-doc
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Access Application

- Local: http://localhost:5173
- Network: Will be shown in terminal

### 5. Build for Production

```bash
npm run build
```

### 6. Deploy to GitHub Pages

```bash
npm run deploy
```

## File Structure

```
desktop-doc/
├── src/
│   ├── App.jsx           # Main app component
│   ├── i18n.js          # Language translations
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── package.json         # Dependencies & scripts
├── vite.config.js      # Vite configuration
└── README.md           # Public documentation
```

## Development Notes

- Uses React 18 + Vite
- Canvas API for video rendering
- MediaRecorder for WebM export
- Tailwind CSS + Radix UI components
- Turkish/English i18n support

## Troubleshooting

- Clear browser cache if issues persist
- Check console for errors
- Ensure Node.js v16+ is installed
- Use Chrome/Firefox for best compatibility

---

**Keep this file private - contains personal setup info**

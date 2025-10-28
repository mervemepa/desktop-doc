# Desktop Documentary Workshop 🎬

A web-based video editing tool for creating desktop documentaries with images and videos. Built with React and Vite, featuring crossfades, captions, and WebM recording capabilities.

## ✨ Features

- **Media Library**: Drag & drop images and videos
- **Timeline Editor**: Arrange clips with custom durations
- **Live Preview**: Real-time playback with crossfade effects
- **Captions**: Add text overlays to your clips
- **Recording**: Export as WebM format
- **Multilingual**: Turkish and English support
- **Cyberpunk Theme**: Customizable color schemes
- **Responsive Design**: Works on desktop and tablet

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- Modern web browser (Chrome, Firefox, Safari)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/desktop-doc.git
cd desktop-doc
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## 📖 How to Use

### 1. Add Media to Library

- **Drag & Drop**: Drag image/video files directly into the library area
- **Click to Browse**: Click the library area to open file picker
- Supported formats: Images (JPG, PNG, GIF) and Videos (MP4, WebM, MOV)

### 2. Build Your Timeline

- Click **"Add"** button next to any media item to add it to timeline
- Adjust image durations using the slider (0.05s to 4s)
- Video durations are automatically detected
- Add captions in the text input field

### 3. Customize Settings

- **Crossfade Duration**: Set transition time between clips (0-3 seconds)
- **Output Resolution**: Choose from 720p, 1080p, or 4K
- **Global Title**: Add a title that appears throughout the video
- **Color Theme**: Select cyberpunk color scheme

### 4. Preview & Record

- **Play**: Preview your documentary with the play button
- **Record**: Click "Record (WebM)" to start recording
- **Stop**: Click "Stop" when finished recording
- The WebM file will automatically download

### 5. Convert to MP4 (Optional)

Use FFmpeg to convert WebM to MP4:

```bash
ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p output.mp4
```

## 🌍 Language Support

Switch between Turkish and English using the language buttons in the top-right corner of the media library.

## 🎨 Customization

### Color Themes

Choose from 5 cyberpunk color schemes:

- **Green**: Classic terminal green
- **Amber**: Retro amber CRT
- **Red**: Alert red theme
- **Blue**: Cool blue matrix
- **Purple**: Neon purple vibes

### Timeline Controls

- **Duration Slider**: Fine-tune image display time (0.05s increments)
- **Captions**: Add descriptive text overlays
- **Reordering**: Drag timeline items to rearrange (coming soon)

## 🔧 Development

### Build for Production

```bash
npm run build
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

### Project Structure

```
src/
├── App.jsx          # Main application component
├── i18n.js          # Internationalization setup
├── main.jsx         # React entry point
└── index.css        # Global styles
```

## 📋 Technical Details

### Dependencies

- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **Radix UI**: Accessible component primitives
- **Lucide React**: Icon library
- **Tailwind CSS**: Utility-first CSS

### Browser APIs Used

- **File API**: For drag & drop file handling
- **Canvas API**: For video rendering and effects
- **MediaRecorder API**: For WebM recording
- **Web Audio API**: For crossfade effects

## 🐛 Troubleshooting

### Common Issues

**Files not loading:**

- Check file formats are supported
- Ensure files aren't corrupted
- Try refreshing the page

**Recording not working:**

- Use Chrome or Firefox for best compatibility
- Check browser permissions for media recording
- Ensure sufficient disk space

**Timeline not updating:**

- Try adding media to library first
- Check console for JavaScript errors
- Refresh and try again

### Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ❌ Internet Explorer (not supported)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with modern web technologies
- Inspired by desktop documentary filmmaking
- UI components from Radix UI and Tailwind CSS
- Icons from Lucide React

---

**Made with ❤️ for desktop documentary creators**

For support or questions, please open an issue on GitHub.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Color Palette Test Page
 * Testing palette from: https://coolors.co/0a2463-fb3640-605f5e-247ba0-e2e2e2-c6ccb2
 * 
 * Colors:
 * - #0a2463 - Dark Navy (Primary Dark)
 * - #fb3640 - Red/Coral (Accent/CTA)
 * - #605f5e - Dark Gray (Text/Secondary)
 * - #247ba0 - Medium Blue (Primary)
 * - #e2e2e2 - Light Gray (Background)
 * - #c6ccb2 - Sage (Accent/Success)
 */

export default function ColorPaletteTest() {
  const palette = {
    darkNavy: '#0a2463',
    coral: '#fb3640',
    darkGray: '#605f5e',
    mediumBlue: '#247ba0',
    lightGray: '#e2e2e2',
    sage: '#c6ccb2',
  };

  return (
    <div className="min-h-screen p-8" style={{ backgroundColor: palette.lightGray }}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: palette.darkNavy }}>
            Color Palette Test
          </h1>
          <p className="text-lg" style={{ color: palette.darkGray }}>
            Testing the Coolors palette for GetMyDPC Enrollment Platform
          </p>
        </div>

        {/* Color Swatches */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Color Swatches</CardTitle>
            <CardDescription>Primary colors from the palette</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(palette).map(([name, color]) => (
                <div key={name} className="space-y-2">
                  <div 
                    className="h-24 rounded-lg border-2 border-gray-300 shadow-md"
                    style={{ backgroundColor: color }}
                  />
                  <div className="text-sm">
                    <p className="font-semibold capitalize">{name.replace(/([A-Z])/g, ' $1').trim()}</p>
                    <p className="font-mono text-xs text-gray-600">{color}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Buttons */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Button Variations</CardTitle>
            <CardDescription>Different button styles with the new palette</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <button 
                  className="px-6 py-2 rounded-lg font-semibold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: palette.darkNavy }}
                >
                  Primary (Dark Navy)
                </button>
                <button 
                  className="px-6 py-2 rounded-lg font-semibold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: palette.mediumBlue }}
                >
                  Secondary (Medium Blue)
                </button>
                <button 
                  className="px-6 py-2 rounded-lg font-semibold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: palette.coral }}
                >
                  CTA (Coral)
                </button>
                <button 
                  className="px-6 py-2 rounded-lg font-semibold transition-all hover:opacity-90"
                  style={{ 
                    backgroundColor: palette.sage,
                    color: palette.darkNavy
                  }}
                >
                  Success (Sage)
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <button 
                  className="px-6 py-2 rounded-lg font-semibold border-2 transition-all hover:opacity-90"
                  style={{ 
                    borderColor: palette.darkNavy,
                    color: palette.darkNavy,
                    backgroundColor: 'white'
                  }}
                >
                  Outline Dark Navy
                </button>
                <button 
                  className="px-6 py-2 rounded-lg font-semibold border-2 transition-all hover:opacity-90"
                  style={{ 
                    borderColor: palette.mediumBlue,
                    color: palette.mediumBlue,
                    backgroundColor: 'white'
                  }}
                >
                  Outline Blue
                </button>
                <button 
                  className="px-6 py-2 rounded-lg font-semibold border-2 transition-all hover:opacity-90"
                  style={{ 
                    borderColor: palette.coral,
                    color: palette.coral,
                    backgroundColor: 'white'
                  }}
                >
                  Outline Coral
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards with Different Backgrounds */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="shadow-lg" style={{ backgroundColor: 'white' }}>
            <CardHeader style={{ backgroundColor: palette.darkNavy }}>
              <CardTitle className="text-white">Dark Navy Header</CardTitle>
              <CardDescription className="text-gray-200">With white card body</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <p style={{ color: palette.darkGray }}>
                This card demonstrates the dark navy header with a white body. 
                Perfect for creating visual hierarchy and drawing attention to important sections.
              </p>
              <button 
                className="mt-4 px-4 py-2 rounded-lg font-semibold text-white transition-all hover:opacity-90"
                style={{ backgroundColor: palette.coral }}
              >
                Take Action
              </button>
            </CardContent>
          </Card>

          <Card className="shadow-lg" style={{ backgroundColor: 'white' }}>
            <CardHeader style={{ backgroundColor: palette.mediumBlue }}>
              <CardTitle className="text-white">Medium Blue Header</CardTitle>
              <CardDescription className="text-gray-200">Friendlier, lighter option</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <p style={{ color: palette.darkGray }}>
                The medium blue provides a softer, more approachable feel while 
                maintaining professional credibility.
              </p>
              <button 
                className="mt-4 px-4 py-2 rounded-lg font-semibold transition-all hover:opacity-90"
                style={{ 
                  backgroundColor: palette.sage,
                  color: palette.darkNavy
                }}
              >
                Learn More
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Typography Samples */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Typography & Text Colors</CardTitle>
            <CardDescription>How the palette works with different text styles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-3xl font-bold mb-2" style={{ color: palette.darkNavy }}>
                Heading in Dark Navy
              </h2>
              <p style={{ color: palette.darkGray }}>
                Body text in dark gray for optimal readability. This ensures great contrast 
                while maintaining a sophisticated, professional appearance.
              </p>
            </div>

            <div>
              <h2 className="text-3xl font-bold mb-2" style={{ color: palette.mediumBlue }}>
                Heading in Medium Blue
              </h2>
              <p style={{ color: palette.darkGray }}>
                A lighter alternative for headings that still stands out but feels more approachable.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <span 
                className="px-3 py-1 rounded-full text-sm font-semibold"
                style={{ backgroundColor: palette.darkNavy, color: 'white' }}
              >
                Premium
              </span>
              <span 
                className="px-3 py-1 rounded-full text-sm font-semibold"
                style={{ backgroundColor: palette.mediumBlue, color: 'white' }}
              >
                Active
              </span>
              <span 
                className="px-3 py-1 rounded-full text-sm font-semibold"
                style={{ backgroundColor: palette.sage, color: palette.darkNavy }}
              >
                Enrolled
              </span>
              <span 
                className="px-3 py-1 rounded-full text-sm font-semibold"
                style={{ backgroundColor: palette.coral, color: 'white' }}
              >
                Action Required
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Hero Section Example */}
        <Card className="shadow-xl overflow-hidden">
          <div 
            className="p-12 text-center"
            style={{ 
              background: `linear-gradient(135deg, ${palette.darkNavy} 0%, ${palette.mediumBlue} 100%)`
            }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Welcome to Direct Primary Care
            </h1>
            <p className="text-xl text-gray-100 mb-8">
              Affordable, personalized healthcare for you and your family
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button 
                className="px-8 py-3 rounded-lg font-semibold text-lg transition-all hover:opacity-90 shadow-lg"
                style={{ backgroundColor: palette.coral, color: 'white' }}
              >
                Enroll Now
              </button>
              <button 
                className="px-8 py-3 rounded-lg font-semibold text-lg border-2 transition-all hover:bg-white hover:bg-opacity-10"
                style={{ borderColor: 'white', color: 'white' }}
              >
                Learn More
              </button>
            </div>
          </div>
        </Card>

        {/* Gradient Combinations */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Gradient Options</CardTitle>
            <CardDescription>Various gradient combinations from the palette</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div 
                className="h-32 rounded-lg flex items-center justify-center text-white font-semibold text-lg"
                style={{ background: `linear-gradient(135deg, ${palette.darkNavy} 0%, ${palette.mediumBlue} 100%)` }}
              >
                Navy to Blue
              </div>
              <div 
                className="h-32 rounded-lg flex items-center justify-center text-white font-semibold text-lg"
                style={{ background: `linear-gradient(135deg, ${palette.mediumBlue} 0%, ${palette.coral} 100%)` }}
              >
                Blue to Coral
              </div>
              <div 
                className="h-32 rounded-lg flex items-center justify-center font-semibold text-lg"
                style={{ 
                  background: `linear-gradient(135deg, ${palette.lightGray} 0%, ${palette.sage} 100%)`,
                  color: palette.darkNavy
                }}
              >
                Light Gray to Sage
              </div>
              <div 
                className="h-32 rounded-lg flex items-center justify-center text-white font-semibold text-lg"
                style={{ background: `linear-gradient(135deg, ${palette.darkNavy} 0%, ${palette.coral} 100%)` }}
              >
                Navy to Coral
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Color Usage Recommendations */}
        <Card className="shadow-lg" style={{ borderLeft: `4px solid ${palette.mediumBlue}` }}>
          <CardHeader>
            <CardTitle>Recommended Usage</CardTitle>
            <CardDescription>How to apply this palette effectively</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" style={{ color: palette.darkGray }}>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: palette.darkNavy }} />
                <div>
                  <strong style={{ color: palette.darkNavy }}>Dark Navy (#0a2463)</strong> - Primary brand color, main headers, navigation bars, important CTAs
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: palette.mediumBlue }} />
                <div>
                  <strong style={{ color: palette.mediumBlue }}>Medium Blue (#247ba0)</strong> - Secondary buttons, links, subheadings, hover states
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: palette.coral }} />
                <div>
                  <strong style={{ color: palette.coral }}>Coral (#fb3640)</strong> - High-priority CTAs, alerts, destructive actions, urgency indicators
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: palette.sage }} />
                <div>
                  <strong style={{ color: palette.darkNavy }}>Sage (#c6ccb2)</strong> - Success messages, confirmed status, tertiary buttons, subtle accents
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: palette.darkGray }} />
                <div>
                  <strong style={{ color: palette.darkGray }}>Dark Gray (#605f5e)</strong> - Body text, secondary text, borders
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: palette.lightGray }} />
                <div>
                  <strong style={{ color: palette.darkGray }}>Light Gray (#e2e2e2)</strong> - Backgrounds, card backgrounds, subtle dividers
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

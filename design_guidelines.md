# Email Application Design Guidelines

## Design Approach
**System**: Productivity-focused design inspired by Linear, Superhuman, and modern SaaS tools
**Rationale**: Professional email tools require clarity, efficiency, and visual hierarchy. Dark theme with high contrast for extended use.

## Typography
- **Primary Font**: Inter (Google Fonts)
- **Headings**: 600-700 weight, sizes: text-2xl (dashboard), text-xl (sections), text-lg (cards)
- **Body**: 400 weight, text-sm to text-base
- **Monospace**: JetBrains Mono for email addresses/technical details

## Layout System
**Spacing Primitives**: Use Tailwind units 2, 4, 6, 8, 12, 16
- Component padding: p-6 to p-8
- Section gaps: gap-6 for grids, gap-4 for lists
- Container max-width: max-w-7xl with px-6

**Application Structure**:
- Sidebar navigation (w-64, fixed left)
- Main content area (flex-1)
- No hero section needed - functional dashboard layout

## Core Components

### Navigation Sidebar
- Full-height fixed sidebar with sections: Compose, Inbox, Sent, Templates, Settings
- Active state with subtle accent border-l-2
- Icon + label pairs with gap-3
- Bottom section for user profile

### Dashboard View
Three-column grid (grid-cols-1 lg:grid-cols-3 gap-6):
1. Quick stats cards (sent today, templates saved, scheduled)
2. Recent activity feed
3. Quick compose widget

### Compose Interface
Two-panel layout:
- **Left Panel (2/3 width)**: 
  - Recipient input with tag-style chips for multiple emails
  - Subject line input (border-b accent on focus)
  - Rich text editor area (min-h-96)
  - Attachment zone with drag-drop indicator
- **Right Panel (1/3 width)**:
  - Template selector dropdown
  - Bulk send toggle
  - CSV upload for bulk (when toggled)
  - Send scheduling options
  - Send button (prominent, gradient accent)

### Template Management
Grid layout (grid-cols-1 md:grid-cols-2 lg:grid-cols-3):
- Template cards with:
  - Template name (text-lg font-semibold)
  - Subject preview (text-sm, truncate)
  - Body snippet (text-xs, opacity-70, line-clamp-2)
  - Action buttons row: Use, Edit, Delete
  - Hover state: subtle border glow
- "Create Template" card with dashed border, centered icon

### Template Editor Modal
Full-screen overlay (backdrop-blur):
- Centered container (max-w-3xl)
- Template name input
- Subject line input
- Message body textarea (min-h-64)
- Variable insertion helper ({{name}}, {{email}}, etc.)
- Save/Cancel buttons

## Visual Specifications

**Dark Theme Palette** (no specific colors, focus on contrast):
- Deep backgrounds with layered surfaces
- High contrast text (near-white on dark)
- Subtle borders for separation
- Accent for interactive elements and focus states

**Component Styling**:
- Cards: rounded-lg with subtle border
- Inputs: rounded-md, border focus with ring
- Buttons: rounded-md, primary uses gradient, secondary uses border
- Modals: rounded-xl with shadow-2xl

**Data Display**:
- Table for sent emails: sticky header, hover row highlight, alternating subtle row background
- Status badges: rounded-full px-3 py-1 text-xs (Sent, Scheduled, Failed)

## Images Section
**No hero image required** - functional application interface
If brand identity needed: Small logo in sidebar header (h-8) and login screen only

## Interactions
- Smooth transitions on all state changes (transition-all duration-200)
- Loading states with skeleton screens for template grid
- Toast notifications for actions (top-right, slide-in)
- Confirmation dialogs for delete actions (centered modal)

## Accessibility
- All inputs with visible labels
- Focus rings on interactive elements (ring-2 ring-offset-2)
- Keyboard navigation support for sidebar and template grid
- ARIA labels for icon-only buttons
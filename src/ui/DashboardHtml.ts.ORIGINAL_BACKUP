import * as vscode from 'vscode';

/**
 * Generates the HTML content for the CodePause dashboard webview
 * @param webview The webview instance
 * @param extensionUri The extension URI for loading resources
 * @returns HTML string for the dashboard
 */
export function getDashboardHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'resources', 'codepause-icon.svg')
  );
  const codiconCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'resources', 'codicon.css')
  );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-inline'; img-src ${webview.cspSource} data:;">
    <title>CodePause Dashboard</title>
    <link rel="stylesheet" href="${codiconCssUri}">
    <style>

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
            line-height: 1.6;
        }

        .header {
            margin-bottom: 16px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 16px;
            position: relative;
            background-color: var(--vscode-sideBar-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        .logo {
            width: 48px;
            height: 48px;
            flex-shrink: 0;
        }

        .streak-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border: 1px solid var(--vscode-badge-background);
            padding: 4px 10px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: help;
            white-space: nowrap;
            margin-left: 12px;
        }

        .streak-badge .fire {
            font-size: 13px;
            animation: flicker 2s infinite;
        }

        @keyframes flicker {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.1); }
        }

        .auto-refresh-status {
            display: flex;
            align-items: center;
        }

        .header-content {
            flex: 1;
        }

        h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }

        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin: 0 0 12px 0;
            padding: 12px;
            background-color: var(--vscode-sideBar-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        .action-group {
            display: flex;
            gap: 6px;
            padding-right: 12px;
            border-right: 1px solid var(--vscode-panel-border);
        }

        .action-group:last-child {
            border-right: none;
            padding-right: 0;
        }

        .auto-refresh-status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            padding: 8px 12px;
            background-color: var(--vscode-sideBar-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        button {
            background-color: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-panel-border);
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.15s ease;
            white-space: nowrap;
            flex-shrink: 0;
        }

        button:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        button:active {
            background-color: var(--vscode-list-activeSelectionBackground);
        }

        .icon {
            font-size: 16px;
            line-height: 1;
            font-weight: normal;
            opacity: 0.9;
        }

        .stats-container {
            margin-bottom: 24px;
        }

        .primary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 16px;
        }

        .secondary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
        }

        .stat-card {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            position: relative;
            transition: all 0.2s ease;
        }

        .stat-card:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .stat-card.primary {
            padding: 20px;
            border-width: 2px;
        }

        .stat-card.warning {
            border-color: #f48771;
            background-color: rgba(244, 135, 113, 0.05);
        }

        .stat-card.success {
            border-color: #89d185;
            background-color: rgba(137, 209, 133, 0.05);
        }

        .stat-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }

        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            flex: 1;
        }

        .stat-card.primary .stat-label {
            font-size: 13px;
            font-weight: 500;
        }

        .help-icon {
            cursor: help;
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.6;
            transition: opacity 0.2s;
        }

        .help-icon:hover {
            opacity: 1;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin: 8px 0;
        }

        .stat-card.primary .stat-value {
            font-size: 32px;
        }

        .stat-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .stat-trend {
            font-size: 11px;
            margin-top: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .trend-increasing { color: #f48771; }
        .trend-decreasing { color: #89d185; }
        .trend-stable { color: var(--vscode-descriptionForeground); }

        /* Inverse colors for metrics where lower is better */
        .trend-good { color: #89d185; }
        .trend-bad { color: #f48771; }
        .trend-neutral { color: var(--vscode-descriptionForeground); }

        /* NEW UX: Core Metrics Styles */
        .project-scope-banner {
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding: 12px 16px;
            margin-bottom: 24px;
            border-radius: 4px;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .project-scope-banner .codicon {
            font-size: 16px;
        }

        .scope-badge {
            display: inline-block;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .scope-badge.today {
            background: #007acc;
            color: #ffffff;
        }

        .scope-badge.week {
            background: #73c991;
            color: #ffffff;
        }

        .core-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }

        .core-metric-card {
            background: var(--vscode-sideBar-background);
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            transition: all 0.2s ease;
        }

        .core-metric-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .core-metric-card.good {
            border-color: #27ae60;
        }

        .core-metric-card.warning {
            border-color: #f39c12;
        }

        .core-metric-card.over-threshold {
            border-color: #e74c3c;
        }

        .core-metric-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }

        .core-metric-icon {
            font-size: 32px;
            opacity: 0.8;
        }

        .core-metric-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .core-metric-value {
            font-size: 36px;
            font-weight: 700;
            line-height: 1.2;
            margin-bottom: 8px;
        }

        .core-metric-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
        }

        .core-metric-bar {
            height: 6px;
            background: var(--vscode-input-background);
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .core-metric-bar-fill {
            height: 100%;
            transition: width 0.3s ease;
        }

        .core-metric-bar-fill.good {
            background: linear-gradient(90deg, #27ae60, #2ecc71);
        }

        .core-metric-bar-fill.warning {
            background: linear-gradient(90deg, #f39c12, #f1c40f);
        }

        .core-metric-bar-fill.danger {
            background: linear-gradient(90deg, #e74c3c, #e67e22);
        }

        .core-metric-footer {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        /* NEW UX: Collapsible Sections */
        .collapsible-section {
            margin-bottom: 24px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .collapsible-header {
            padding: 14px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--vscode-sideBar-background);
            transition: all 0.2s ease;
            user-select: none;
            border-bottom: 1px solid transparent;
            flex-wrap: wrap;
        }

        .collapsible-header-info {
            margin-left: auto;
            font-size: 12px;
            opacity: 0.7;
            font-weight: normal;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .collapsible-header:hover {
            background: var(--vscode-list-hoverBackground);
            border-bottom-color: var(--vscode-focusBorder);
        }

        .collapsible-header:hover .expand-icon {
            color: var(--vscode-focusBorder);
            transform: rotate(0deg) scale(1.1);
        }

        .collapsible-header:hover .expand-icon.expanded {
            transform: rotate(180deg) scale(1.1);
        }

        .collapsible-content {
            padding: 0 16px;
            max-height: 0;
            overflow: hidden;
            opacity: 0;
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.3s ease,
                        padding 0.3s ease;
        }

        .collapsible-content.expanded {
            max-height: 5000px;
            opacity: 1;
            padding: 16px;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-5px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .expand-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 20px;
            min-height: 20px;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                        color 0.2s ease,
                        opacity 0.2s ease;
            font-size: 12px;
            line-height: 1;
            color: var(--vscode-foreground);
            opacity: 0.7;
            flex-shrink: 0;
            user-select: none;
            transform: rotate(0deg);
        }

        .expand-icon.expanded {
            transform: rotate(180deg);
            color: var(--vscode-focusBorder);
            opacity: 1;
        }

        /* Responsive collapsible sections */
        @media (max-width: 768px) {
            .header {
                padding: 12px;
                margin-bottom: 12px;
            }

            .logo {
                width: 40px;
                height: 40px;
            }

            h1 {
                font-size: 20px;
            }

            .actions {
                padding: 10px;
                margin-bottom: 10px;
            }

            .auto-refresh-status {
                padding: 6px 10px;
                margin-bottom: 10px;
                font-size: 10px;
            }

            .collapsible-header {
                padding: 12px;
                font-size: 14px;
            }

            .collapsible-header strong {
                font-size: 14px;
            }

            .collapsible-header-info {
                width: 100%;
                margin-left: 28px;
                font-size: 11px;
            }

            .collapsible-content.expanded {
                padding: 12px;
            }

            .expand-icon {
                font-size: 10px;
                min-width: 16px;
                min-height: 16px;
            }
        }

        @media (max-width: 480px) {
            .header {
                padding: 10px;
            }

            .actions {
                padding: 8px;
            }

            .collapsible-header {
                padding: 10px;
            }

            .collapsible-content.expanded {
                padding: 10px;
            }

            .collapsible-header-info span {
                font-size: 10px;
            }
        }

        /* NEW UX: Simplified Mode Cards - Modern Design */
        .mode-card-simple {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 12px;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }

        .mode-card-simple::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            transition: width 0.2s ease;
        }

        .mode-card-simple:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .mode-card-simple:hover::before {
            width: 6px;
        }

        .mode-card-simple.agent::before {
            background: linear-gradient(180deg, #e74c3c, #c0392b);
        }

        .mode-card-simple.inline::before {
            background: linear-gradient(180deg, #f39c12, #e67e22);
        }

        .mode-card-simple.chat::before {
            background: linear-gradient(180deg, #3498db, #2980b9);
        }

        .mode-icon-wrapper {
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            flex-shrink: 0;
        }

        .mode-card-simple.agent .mode-icon-wrapper {
            background: linear-gradient(135deg, rgba(231, 76, 60, 0.1), rgba(231, 76, 60, 0.05));
        }

        .mode-card-simple.inline .mode-icon-wrapper {
            background: linear-gradient(135deg, rgba(243, 156, 18, 0.1), rgba(243, 156, 18, 0.05));
        }

        .mode-card-simple.chat .mode-icon-wrapper {
            background: linear-gradient(135deg, rgba(52, 152, 219, 0.1), rgba(52, 152, 219, 0.05));
        }

        .mode-icon {
            font-size: 24px;
        }

        .mode-card-simple.agent .mode-icon {
            color: #e74c3c;
        }

        .mode-card-simple.inline .mode-icon {
            color: #f39c12;
        }

        .mode-card-simple.chat .mode-icon {
            color: #3498db;
        }

        .mode-info {
            flex: 1;
            min-width: 0;
        }

        .mode-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .mode-stats {
            font-size: 15px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
        }

        .mode-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        }

        .mode-action {
            text-align: right;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
        }

        .mode-action-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .mode-action button {
            padding: 8px 14px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .mode-action button:hover {
            background: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .mode-action button:active {
            transform: translateY(0);
        }

        /* Quick Stats Grid (for collapsible details) */
        .quick-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }

        .quick-stat {
            padding: 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .core-metrics {
                grid-template-columns: 1fr;
            }

            .quick-stats-grid {
                grid-template-columns: 1fr;
            }

            .mode-card-simple {
                flex-direction: row;
                flex-wrap: wrap;
            }

            .mode-icon-wrapper {
                width: 42px;
                height: 42px;
            }

            .mode-info {
                flex: 1;
                min-width: 200px;
            }

            .mode-action {
                width: 100%;
                align-items: flex-start;
                margin-top: 8px;
                padding-top: 12px;
                border-top: 1px solid var(--vscode-panel-border);
            }

            .core-metric-icon {
                font-size: 24px;
            }

            .core-metric-value {
                font-size: 28px;
            }
        }

        @media (max-width: 480px) {
            .collapsible-header {
                font-size: 13px;
                padding: 12px 14px;
            }

            .collapsible-header strong {
                font-size: 13px;
            }

            .core-metric-value {
                font-size: 22px;
            }

            .mode-icon-wrapper {
                width: 38px;
                height: 38px;
            }

            .mode-icon {
                font-size: 20px;
            }

            .mode-title {
                font-size: 13px;
            }

            .mode-stats {
                font-size: 13px;
            }

            .mode-action button {
                width: 100%;
                justify-content: center;
            }
        }

        .quick-stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .quick-stat-value {
            font-size: 20px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }

        .quick-stat-detail {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }

        .section {
            margin-bottom: 24px;
        }

        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
        }

        .tool-breakdown {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .tool-category-section {
            margin-bottom: 24px;
        }

        .tool-category-header {
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }

        .tool-category-header h4 {
            margin: 0 0 6px 0;
            font-size: 15px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .tool-category-description {
            margin: 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .tool-item {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            margin-bottom: 12px;
            transition: all 0.2s ease;
        }

        .tool-item:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .tool-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .tool-name {
            font-weight: 600;
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tool-acceptance {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .tool-acceptance-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }

        .tool-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .tool-stat-item {
            display: flex;
            flex-direction: column;
        }

        .tool-stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .tool-stat-value {
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .acceptance-bar {
            width: 100%;
            height: 6px;
            background-color: var(--vscode-input-border);
            border-radius: 3px;
            overflow: hidden;
            margin-top: 8px;
        }

        .acceptance-bar-fill {
            height: 100%;
            background-color: var(--vscode-button-background);
            transition: width 0.3s ease;
        }

        .acceptance-bar-fill.high {
            background-color: #89d185;
        }

        .acceptance-bar-fill.medium {
            background-color: #f0c541;
        }

        .acceptance-bar-fill.low {
            background-color: #f48771;
        }

        .tools-controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            gap: 12px;
            flex-wrap: wrap;
        }

        .sort-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }

        .sort-controls label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .sort-controls select {
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
        }

        .sort-controls select:hover {
            background-color: var(--vscode-dropdown-listBackground);
        }

        .filter-controls {
            position: relative;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }

        .filter-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-panel-border);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
            white-space: nowrap;
        }

        .filter-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .filter-button.active {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .filter-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
            min-width: 18px;
            text-align: center;
        }

        .filter-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            min-width: 200px;
            max-width: 280px;
        }

        .filter-dropdown.show {
            display: block;
        }

        .filter-dropdown-header {
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 500;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .filter-checkboxes {
            padding: 8px 0;
            max-height: 200px;
            overflow-y: auto;
        }

        .filter-checkbox-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            cursor: pointer;
            transition: background-color 0.15s ease;
        }

        .filter-checkbox-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .filter-checkbox-item input[type="checkbox"] {
            cursor: pointer;
            margin: 0;
        }

        .filter-checkbox-item label {
            cursor: pointer;
            color: var(--vscode-foreground);
            flex: 1;
            margin: 0;
            font-weight: normal;
            font-size: 12px;
        }

        .filter-actions {
            display: flex;
            gap: 0;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .filter-action-btn {
            flex: 1;
            background-color: transparent;
            color: var(--vscode-textLink-foreground);
            border: none;
            padding: 8px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
            border-radius: 0;
        }

        .filter-action-btn:first-child {
            border-right: 1px solid var(--vscode-panel-border);
        }

        .filter-action-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
            color: var(--vscode-textLink-activeForeground);
        }

        .filter-status {
            margin-top: 12px;
            margin-bottom: 8px;
            padding: 8px 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-focusBorder);
            border-radius: 2px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .filter-status-text {
            flex: 1;
        }

        .filter-status-clear {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            font-weight: 500;
            text-decoration: none;
            padding: 2px 8px;
            border-radius: 3px;
            transition: all 0.15s ease;
        }

        .filter-status-clear:hover {
            background-color: var(--vscode-list-hoverBackground);
            color: var(--vscode-textLink-activeForeground);
        }

        .tool-breakdown {
            margin-top: 20px;
        }

        .tool-breakdown-empty {
            text-align: center;
            padding: 32px 16px;
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-editor-background);
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 4px;
            margin-top: 16px;
        }

        .tool-breakdown-empty-icon {
            font-size: 32px;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        .tool-icon {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            display: inline-block;
            vertical-align: middle;
        }

        .chart-container {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            min-height: 200px;
            position: relative;
        }

        .chart-wrapper {
            position: relative;
            height: 160px;
            display: flex;
            gap: 8px;
            width: 100%;
        }

        .chart-y-axis {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding-right: 6px;
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            min-width: 28px;
            width: 28px;
            text-align: right;
            flex-shrink: 0;
        }

        .chart-bars {
            display: flex;
            align-items: flex-end;
            flex: 1;
            height: 140px;
            gap: 4px;
            position: relative;
            min-width: 0;
        }

        @media (max-width: 400px) {
            .chart-wrapper {
                height: 140px;
            }

            .chart-bars {
                height: 120px;
                gap: 2px;
            }

            .chart-y-axis {
                font-size: 8px;
                min-width: 24px;
                width: 24px;
            }

            .chart-container {
                padding: 8px;
            }
        }

        .threshold-line {
            position: absolute;
            left: 0;
            right: 0;
            border-top: 2px dashed rgba(244, 135, 113, 0.5);
            pointer-events: none;
        }

        .threshold-label {
            position: absolute;
            right: 4px;
            top: -8px;
            font-size: 9px;
            color: #f48771;
            background: var(--vscode-input-background);
            padding: 0 4px;
        }

        .chart-bar {
            width: 100%;
            min-width: 20px;
            background-color: var(--vscode-button-background);
            border-radius: 2px 2px 0 0;
            position: relative;
            transition: all 0.3s;
        }

        .chart-bar:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .chart-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            margin-top: 4px;
        }

        .chart-value {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-foreground);
            text-align: center;
            margin-bottom: 4px;
        }

        .empty-state {
            text-align: center;
            padding: 48px 16px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .snooze-banner {
            background-color: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
        }

        .loading {
            text-align: center;
            padding: 32px;
            color: var(--vscode-descriptionForeground);
        }

        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: var(--vscode-notifications-background);
            border: 1px solid var(--vscode-notifications-border);
            color: var(--vscode-notifications-foreground);
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 13px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s ease;
            z-index: 1000;
        }

        .toast.show {
            opacity: 1;
            transform: translateY(0);
        }

        .auto-refresh-indicator {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: var(--vscode-charts-green);
            margin-left: 4px;
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .tooltip {
            position: fixed;
            background-color: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            color: var(--vscode-editorHoverWidget-foreground);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 250px;
            word-wrap: break-word;
            z-index: 10000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        .tooltip.show {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="${logoUri}" alt="CodePause" class="logo" />
        <div class="header-content">
            <h1>CodePause Dashboard</h1>
            <p class="subtitle">Pause. Review. Own your code.</p>
        </div>
    </div>

    <div class="actions">
        <div class="action-group">
            <button onclick="refresh()">
                <span class="icon">⟳</span>
                Refresh
            </button>
            <button onclick="openSettings()">
                <span class="icon">⚙</span>
                Settings
            </button>
        </div>
        <div class="action-group">
            <button onclick="exportData()">
                <span class="icon">↓</span>
                Export Data
            </button>
        </div>
        <div class="action-group">
            <button onclick="snooze()">
                <span class="icon">⏸</span>
                Pause Alerts
            </button>
        </div>
    </div>

    <div class="auto-refresh-status">
        <span class="auto-refresh-indicator"></span>
        Auto-updating every 5 seconds
        <div class="streak-badge" id="streakBadge" style="display: none;" data-tooltip="You've coded for consecutive days! Keep it going to maintain your streak.">
            <span class="fire">🔥</span>
            <span id="streakDays">0</span>
            <span>day streak</span>
        </div>
    </div>

    <div id="content">
        <div class="loading">Loading dashboard...</div>
    </div>

    <div id="tooltip" class="tooltip"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let autoRefreshInterval = null;
        let autoRefreshEnabled = true;
        let isRefreshing = false;
        let currentSortBy = 'acceptance'; // Store current sort option
        let selectedTools = new Set(); // Store selected tools for filtering (empty = show all)
        let expandedSections = new Set(); // Track which sections are expanded across refreshes

        /**
         * Escapes HTML to prevent XSS attacks
         * @param {string|number|boolean|null|undefined} unsafe - Untrusted content
         * @returns {string} Safely escaped string
         */
        function escapeHtml(unsafe) {
            if (unsafe === null || unsafe === undefined) {
                return '';
            }
            const str = String(unsafe);
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;',
                '/': '&#x2F;'
            };
            return str.replace(/[&<>"'/]/g, char => map[char] || char);
        }

        /**
         * SECURITY: Escape string for use in JavaScript context (onclick handlers, etc.)
         * @param {*} unsafe - The value to escape
         * @returns {string} Safely escaped JavaScript string
         */
        function escapeJs(unsafe) {
            if (unsafe === null || unsafe === undefined) {
                return '';
            }
            // Use JSON.stringify for proper JavaScript string escaping
            return JSON.stringify(String(unsafe)).slice(1, -1);
        }

        function refresh(silent = false) {
            if (isRefreshing) return;
            isRefreshing = true;

            if (!silent) {
                // Show loading state for manual refresh
                document.getElementById('content').innerHTML = '<div class="loading">Refreshing dashboard...</div>';
            }
            vscode.postMessage({ type: 'refresh' });
        }

        function exportData() {
            vscode.postMessage({ type: 'export' });
        }

        function openSettings() {
            vscode.postMessage({ type: 'openSettings' });
        }

        function snooze() {
            vscode.postMessage({ type: 'snooze' });
        }

        function toggleSection(sectionId) {
            const content = document.getElementById('content-' + sectionId);
            const icon = document.getElementById('icon-' + sectionId);

            if (content && icon) {
                if (content.classList.contains('expanded')) {
                    content.classList.remove('expanded');
                    icon.classList.remove('expanded');
                    expandedSections.delete(sectionId); // Remove from tracking
                } else {
                    content.classList.add('expanded');
                    icon.classList.add('expanded');
                    expandedSections.add(sectionId); // Add to tracking
                }
            }
        }

        // Restore expanded sections after dashboard re-render
        function restoreExpandedSections() {
            expandedSections.forEach(sectionId => {
                const content = document.getElementById('content-' + sectionId);
                const icon = document.getElementById('icon-' + sectionId);
                if (content && icon) {
                    content.classList.add('expanded');
                    icon.classList.add('expanded');
                }
            });
        }

        function startAutoRefresh() {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
            }
            autoRefreshInterval = setInterval(() => {
                refresh(true); // Silent refresh
            }, 5000); // Refresh every 5 seconds
        }

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateData':
                    renderDashboard(message.data);
                    isRefreshing = false;
                    break;
                case 'error':
                    showError(message.message);
                    isRefreshing = false;
                    break;
            }
        });

        function renderDashboard(data) {
            try {
                const content = document.getElementById('content');

                // Update streak badge
                const streakBadge = document.getElementById('streakBadge');
                const streakDaysElement = document.getElementById('streakDays');
                if (data.streakDays && data.streakDays > 0) {
                    streakDaysElement.textContent = data.streakDays;
                    streakBadge.style.display = 'flex';
                } else {
                    streakBadge.style.display = 'none';
                }

                if (data.today.totalEvents === 0) {

                content.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-icon">🌱</div>
                        <h2>Start Coding!</h2>
                        <p>CodePause is monitoring your AI usage.<br>Start using AI tools to see insights here.</p>
                        <p style="margin-top: 12px; opacity: 0.7; font-size: 12px;">
                            Auto-refresh is active. Dashboard updates every 5 seconds.
                        </p>
                    </div>
                \`;
                return;
            }

            let html = '';

            // Snooze banner - more prominent
            if (data.snoozeState.snoozed) {
                const snoozeUntil = data.snoozeState.snoozeUntil
                    ? new Date(data.snoozeState.snoozeUntil).toLocaleTimeString()
                    : 'indefinitely';
                html += \`
                    <div class="snooze-banner">
                        <div style="font-size: 20px; margin-bottom: 4px;">⏸ Alerts Paused</div>
                        <div style="font-size: 13px; opacity: 0.9;">
                            Notifications are snoozed until \${escapeHtml(snoozeUntil)}
                        </div>
                        <div style="font-size: 11px; margin-top: 4px; opacity: 0.7;">
                            Dashboard tracking is still active
                        </div>
                    </div>
                \`;
            }

            // NEW UX: Project scope banner
            const multiRootInfo = data.workspace.isMultiRoot ? ' (Multi-root workspace - showing active folder)' : '';
            html += \`
                <div class="project-scope-banner">
                    <span class="codicon codicon-folder"></span>
                    <strong>\${escapeHtml(data.workspace.name)}</strong>
                    <span style="opacity: 0.7; margin-left: 4px;">· Today's activity\${multiRootInfo}</span>
                </div>
            \`;

            // NEW UX: Core Metrics (3 Primary Cards)
            if (data.coreMetrics) {
                const cm = data.coreMetrics;

                html += \`
                    <div class="core-metrics">
                        <!-- Core Metric 1: Code Authorship Balance -->
                        <div class="core-metric-card \${cm.authorship.status}">
                            <div class="core-metric-header">
                                <div>
                                    <span class="codicon codicon-symbol-ruler core-metric-icon"></span>
                                </div>
                                <span class="scope-badge today">TODAY</span>
                            </div>
                            <div class="core-metric-title">
                                Code Authorship Balance
                                <span class="help-icon" data-tooltip="How much code AI wrote vs you wrote today. Lower AI % means you're writing more code yourself." style="margin-left: 6px; cursor: help; opacity: 0.7;">ⓘ</span>
                            </div>
                            <div class="core-metric-value">\${Math.round(cm.authorship.aiPercentage)}% AI / \${Math.round(cm.authorship.manualPercentage)}% Manual</div>
                            <div class="core-metric-bar">
                                <div class="core-metric-bar-fill \${cm.authorship.status === 'good' ? 'good' : cm.authorship.status === 'warning' ? 'warning' : 'danger'}"
                                     style="width: \${cm.authorship.aiPercentage}%"></div>
                            </div>
                            <div class="core-metric-description">
                                \${cm.authorship.aiLines} AI lines / \${cm.authorship.manualLines} manual lines
                            </div>
                            <div class="core-metric-footer">
                                <span class="codicon codicon-target"></span>
                                <span>Target: <\${cm.authorship.target}% AI</span>
                            </div>
                        </div>

                        <!-- Core Metric 2: Code Ownership Score -->
                        <div class="core-metric-card \${cm.ownership.category === 'thorough' ? 'good' : cm.ownership.category === 'light' ? '' : 'warning'}">
                            <div class="core-metric-header">
                                <div>
                                    <span class="codicon codicon-checklist core-metric-icon"></span>
                                </div>
                                <span class="scope-badge today">TODAY</span>
                            </div>
                            <div class="core-metric-title">
                                Code Ownership Score
                                <span class="help-icon" data-tooltip="How well you reviewed AI code today. 70+ = thorough, 40-69 = light, <40 = rushed. Higher is better." style="margin-left: 6px; cursor: help; opacity: 0.7;">ⓘ</span>
                            </div>
                            <div class="core-metric-value">\${cm.ownership.score}/100</div>
                            <div class="core-metric-bar">
                                <div class="core-metric-bar-fill \${cm.ownership.score >= 70 ? 'good' : cm.ownership.score >= 40 ? 'warning' : 'danger'}"
                                     style="width: \${cm.ownership.score}%"></div>
                            </div>
                            <div class="core-metric-description">
                                <span class="codicon codicon-\${cm.ownership.category === 'thorough' ? 'pass' : cm.ownership.category === 'light' ? 'warning' : 'error'}"></span>
                                \${cm.ownership.category === 'thorough' ? 'Thorough Review' : cm.ownership.category === 'light' ? 'Light Review' : 'Rushed/No Review'}
                            </div>
                            <div class="core-metric-footer">
                                <span class="codicon codicon-file-code"></span>
                                <span>\${cm.ownership.filesNeedingReview} files need review</span>
                            </div>
                        </div>

                        <!-- Core Metric 3: Skill Development Health -->
                        <div class="core-metric-card \${cm.skillHealth.status === 'excellent' ? 'good' : cm.skillHealth.status === 'needs-attention' ? 'warning' : ''}">
                            <div class="core-metric-header">
                                <div>
                                    <span class="codicon codicon-\${cm.skillHealth.status === 'excellent' ? 'star-full' : cm.skillHealth.status === 'good' ? 'law' : 'warning'} core-metric-icon"></span>
                                </div>
                                <span class="scope-badge week">THIS WEEK</span>
                            </div>
                            <div class="core-metric-title">
                                Skill Development Health
                                <span class="help-icon" data-tooltip="Overall health based on AI balance, code reviews, and consistency over 7 days. Excellent > Good > Needs Attention." style="margin-left: 6px; cursor: help; opacity: 0.7;">ⓘ</span>
                            </div>
                            <div class="core-metric-value" style="font-size: 28px;">
                                \${cm.skillHealth.status === 'excellent' ? 'Excellent' : cm.skillHealth.status === 'good' ? 'Good' : 'Needs Attention'}
                            </div>
                            <div class="core-metric-bar">
                                <div class="core-metric-bar-fill \${cm.skillHealth.status === 'excellent' ? 'good' : cm.skillHealth.status === 'good' ? 'warning' : 'danger'}"
                                     style="width: \${cm.skillHealth.score}%"></div>
                            </div>
                            <div class="core-metric-description">
                                <span class="codicon codicon-\${cm.skillHealth.trend === 'improving' ? 'trending-up' : cm.skillHealth.trend === 'declining' ? 'trending-down' : 'dash'}"></span>
                                Trend: \${cm.skillHealth.trend === 'improving' ? 'Improving' : cm.skillHealth.trend === 'declining' ? 'Declining' : 'Stable'}
                            </div>
                            <div class="core-metric-footer">
                                <span class="codicon codicon-calendar"></span>
                                <span>\${cm.skillHealth.daysWithActivity}/7 days active</span>
                            </div>
                        </div>
                    </div>
                \`;
            }

            // NEW UX: Collapsible Activity Details Section
            html += \`
                <div class="collapsible-section">
                    <div class="collapsible-header" onclick="toggleSection('activity-details')">
                        <span class="expand-icon" id="icon-activity-details">▼</span>
                        <strong>Today's Coding Activity</strong>
                        <span class="collapsible-header-info">
                            <span>\${data.today.totalAISuggestions} AI suggestions</span>
                            <span>·</span>
                            <span>\${data.today.totalAILines} lines generated</span>
                        </span>
                    </div>
                    <div class="collapsible-content" id="content-activity-details">
                        <div class="quick-stats-grid">
                            <div class="quick-stat">
                                <div class="quick-stat-label">AI Suggestions</div>
                                <div class="quick-stat-value">\${data.today.totalAISuggestions}</div>
                                <div class="quick-stat-detail">\${data.today.totalAILines} lines suggested</div>
                            </div>
                            <div class="quick-stat">
                                <div class="quick-stat-label">Avg Review Time</div>
                                <div class="quick-stat-value">\${formatTime(data.today.averageReviewTime)}</div>
                                <div class="quick-stat-detail">Time spent reviewing suggestions</div>
                            </div>
                            <div class="quick-stat">
                                <div class="quick-stat-label">Manual Code</div>
                                <div class="quick-stat-value">\${data.today.totalManualLines}</div>
                                <div class="quick-stat-detail">Lines you wrote yourself</div>
                            </div>
                            <div class="quick-stat">
                                <div class="quick-stat-label">Experience Level</div>
                                <div class="quick-stat-value" style="font-size: 16px; text-transform: capitalize;">\${escapeHtml(data.config.experienceLevel)}</div>
                                <div class="quick-stat-detail">Target: <\${data.threshold.maxAIPercentage}% AI</div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;

            // NEW UX: Collapsible Files Needing Review Section
            if (data.unreviewedFiles && data.unreviewedFiles.length > 0) {
                html += \`
                    <div class="collapsible-section">
                        <div class="collapsible-header" onclick="toggleSection('files-review')">
                            <span class="expand-icon" id="icon-files-review">▼</span>
                            <strong>Files Needing Review</strong>
                            <span class="collapsible-header-info" style="color: var(--vscode-editorWarning-foreground);">
                                <span>⚠</span>
                                <span>\${data.unreviewedFiles.length} files need your attention</span>
                            </span>
                        </div>
                        <div class="collapsible-content" id="content-files-review">
                            <!-- Unreviewed Files List -->
                        \${data.unreviewedFiles && data.unreviewedFiles.length > 0 ? \`
                            <div style="margin-bottom: 16px;">
                                <div style="font-weight: 600; margin-bottom: 8px; color: var(--vscode-foreground);">
                                    Unreviewed Files (\${data.unreviewedFiles.length})
                                </div>
                                <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
                                    \${data.unreviewedFiles.slice(0, 10).map(file => {
                                        // Use camelCase property names (mapped from database)
                                        const rawPath = file.filePath || 'Unknown file';
                                        const fileName = escapeHtml(rawPath.split('/').pop() || rawPath);
                                        const filePathDisplay = escapeHtml(rawPath); // For display only
                                        const lines = file.linesGenerated || 0;
                                        const tool = file.tool || 'unknown';
                                        const toolDisplay = formatToolName(tool);
                                        // Calculate age with better granularity
                                        const ageMs = Date.now() - (file.firstGeneratedAt || Date.now());
                                        const ageMinutes = Math.floor(ageMs / (1000 * 60));
                                        const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
                                        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

                                        const ageLabel = ageMinutes < 1 ? 'Just now' :
                                                        ageMinutes < 60 ? \`\${ageMinutes} min ago\` :
                                                        ageHours < 24 ? (ageHours === 1 ? '1 hour ago' : \`\${ageHours} hours ago\`) :
                                                        ageDays === 1 ? '1 day ago' : \`\${ageDays} days ago\`;

                                        return \`
                                            <div style="padding: 12px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; align-items: center; background: var(--vscode-editor-background);">
                                                <div style="flex: 1; min-width: 0;">
                                                    <div style="font-weight: 500; color: var(--vscode-foreground); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${filePathDisplay}">
                                                        📄 \${fileName}
                                                    </div>
                                                    <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
                                                        \${lines} lines · \${toolDisplay} · \${ageLabel}
                                                    </div>
                                                </div>
                                                <div style="display: flex; gap: 8px; margin-left: 12px;">
                                                    <button
                                                        onclick="reviewFile('\${escapeJs(rawPath)}')"
                                                        style="padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; white-space: nowrap;"
                                                        onmouseover="this.style.background='var(--vscode-button-hoverBackground)'"
                                                        onmouseout="this.style.background='var(--vscode-button-background)'">
                                                        Review ▶
                                                    </button>
                                                    <button
                                                        onclick="markAsReviewed('\${escapeJs(rawPath)}', '\${escapeJs(tool)}')"
                                                        style="padding: 6px 10px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border); border-radius: 3px; cursor: pointer; font-size: 16px; white-space: nowrap;"
                                                        onmouseover="this.style.background='var(--vscode-button-secondaryHoverBackground)'"
                                                        onmouseout="this.style.background='var(--vscode-button-secondaryBackground)'"
                                                        title="Mark as reviewed">
                                                        ✓
                                                    </button>
                                                </div>
                                            </div>
                                        \`;
                                    }).join('')}
                                    \${data.unreviewedFiles.length > 10 ? \`
                                        <div style="padding: 12px; text-align: center; background: var(--vscode-editor-background); color: var(--vscode-descriptionForeground); font-size: 12px;">
                                            ... and \${data.unreviewedFiles.length - 10} more files
                                        </div>
                                    \` : ''}
                                </div>
                            </div>
                        \` : \`
                            <div style="padding: 16px; background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); border-radius: 4px; text-align: center; color: var(--vscode-foreground); margin-bottom: 16px;">
                                ✅ All AI-generated code has been reviewed today! Great work maintaining code ownership.
                            </div>
                        \`}

                        <!-- Terminal Workflow Files -->
                        \${data.terminalReviewedFiles && data.terminalReviewedFiles.length > 0 ? \`
                            <div style="margin-bottom: 16px;">
                                <div style="font-weight: 600; margin-bottom: 8px; color: var(--vscode-foreground);">
                                    💻 Terminal Workflow Files (\${data.terminalReviewedFiles.length})
                                </div>
                                <div style="padding: 12px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
                                    <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 8px;">
                                        Files created via terminal - not yet opened in editor for review
                                    </div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                        \${data.terminalReviewedFiles.slice(0, 5).map(file => {
                                            const rawPath = file.filePath || 'Unknown file';
                                            const fileName = escapeHtml(rawPath.split('/').pop() || rawPath);
                                            const lines = file.linesGenerated || 0;
                                            return \`<span style="display: inline-flex; align-items: center; padding: 4px 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; font-size: 11px;">
                                                📄 \${fileName} (\${lines} lines)
                                            </span>\`;
                                        }).join('')}
                                        \${data.terminalReviewedFiles.length > 5 ? \`
                                            <span style="display: inline-flex; align-items: center; padding: 4px 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; font-size: 11px;">
                                                +\${data.terminalReviewedFiles.length - 5} more
                                            </span>
                                        \` : ''}
                                    </div>
                                </div>
                            </div>
                        \` : ''}

                        <!-- Agent Sessions -->
                        \${data.agentSessions && data.agentSessions.length > 0 ? \`
                            <div style="margin-bottom: 16px;">
                                <div style="font-weight: 600; margin-bottom: 8px; color: var(--vscode-foreground);">
                                    Recent Agent Sessions
                                </div>
                                <div style="border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
                                    \${data.agentSessions.map((session, index) => {
                                        const tool = formatToolName(session.tool);
                                        const fileCount = session.file_count || 0;
                                        const totalLines = session.total_lines || 0;
                                        const wasReviewed = session.was_reviewed === 1;
                                        const reviewScore = session.review_score || 0;
                                        const reviewQuality = session.review_quality || 'none';
                                        const sessionTime = new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        const sessionDate = new Date(session.start_time).toLocaleDateString();
                                        const isToday = sessionDate === new Date().toLocaleDateString();

                                        const statusIcon = wasReviewed ? '✅' : '🚨';
                                        const statusText = wasReviewed ? \`Reviewed (\${Math.round(reviewScore)}/100)\` : 'Not Reviewed';
                                        const statusColor = wasReviewed ? 'var(--vscode-charts-green)' : 'var(--vscode-inputValidation-errorBackground)';

                                        return \`
                                            <div style="padding: 12px; \${index < data.agentSessions.length - 1 ? 'border-bottom: 1px solid var(--vscode-panel-border);' : ''} background: var(--vscode-editor-background);">
                                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                                                    <div style="flex: 1;">
                                                        <div style="font-weight: 500; color: var(--vscode-foreground); margin-bottom: 2px;">
                                                            \${tool} Agent Session
                                                        </div>
                                                        <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
                                                            \${isToday ? 'Today' : sessionDate} at \${sessionTime} · \${fileCount} files · \${totalLines} lines
                                                        </div>
                                                    </div>
                                                    <div style="text-align: right;">
                                                        <div style="display: inline-block; padding: 4px 8px; background: \${statusColor}; border-radius: 3px; font-size: 11px; font-weight: 500;">
                                                            \${statusIcon} \${statusText}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        \`;
                                    }).join('')}
                                </div>
                            </div>
                        \` : ''}
                        </div>
                    </div>
                \`;
            }

            // NEW UX: Collapsible 7-Day Trend Chart
            const avgAIPercent = data.last7Days.reduce((sum, d) => sum + d.aiPercentage, 0) / 7;

            html += \`
                <div class="collapsible-section">
                    <div class="collapsible-header" onclick="toggleSection('weekly-trend')">
                        <span class="expand-icon" id="icon-weekly-trend">▼</span>
                        <strong>Weekly Trend</strong>
                        <span class="collapsible-header-info">
                            <span>7-day avg: \${Math.round(avgAIPercent)}% AI</span>
                            <span>·</span>
                            <span>\${data.coreMetrics.skillHealth.daysWithActivity}/7 days active</span>
                        </span>
                    </div>
                    <div class="collapsible-content" id="content-weekly-trend">
                    <div class="chart-container">
                        <div class="chart-wrapper">
                            <div class="chart-y-axis">
                                <div>100%</div>
                                <div>75%</div>
                                <div>50%</div>
                                <div>25%</div>
                                <div>0%</div>
                            </div>
                            <div class="chart-bars">
                                <!-- Threshold line -->
                                <div class="threshold-line" style="bottom: \${data.threshold.maxAIPercentage * 1.4}px;">
                                    <span class="threshold-label">Target: \${data.threshold.maxAIPercentage}%</span>
                                </div>

                                \${data.last7Days.map((day, index) => {
                                    const aiPercentage = day.aiPercentage || 0;
                                    const date = new Date(day.date);
                                    const label = date.toLocaleDateString('en-US', { weekday: 'short' });
                                    const isToday = index === data.last7Days.length - 1;
                                    const hasData = day.totalEvents > 0;

                                    // Calculate height in pixels (140px max for 100%)
                                    const heightPx = hasData ? Math.max(Math.round(aiPercentage * 1.4), 5) : 0;

                                    // Color based on threshold
                                    const aboveThreshold = aiPercentage > data.threshold.maxAIPercentage;
                                    const barColor = hasData
                                        ? (aboveThreshold ? '#f48771' : 'var(--vscode-button-background)')
                                        : 'var(--vscode-input-border)';

                                    const barStyle = hasData
                                        ? \`height: \${heightPx}px; width: 100%; background-color: \${barColor}\`
                                        : 'height: 0; width: 100%; opacity: 0.2; background-color: var(--vscode-input-border)';

                                    const tooltip = hasData
                                        ? \`\${label}: \${Math.round(aiPercentage)}% AI (\${day.totalEvents} events)\`
                                        : \`\${label}: No data\`;

                                    const showLabel = hasData && heightPx > 20;

                                    return \`
                                        <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 140px; min-width: 0;">
                                            \${showLabel ? \`<div class="chart-value">\${Math.round(aiPercentage)}%</div>\` : ''}
                                            <div class="chart-bar" style="\${barStyle}" title="\${tooltip}">
                                                \${hasData && !showLabel ? \`<div style="font-size: 9px; color: white; margin-top: 2px;">\${Math.round(aiPercentage)}%</div>\` : ''}
                                            </div>
                                            <div class="chart-label">\${label}\${isToday ? ' ★' : ''}</div>
                                        </div>
                                    \`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            \`;

            // NEW UX: Collapsible Coding Modes Breakdown
            const modes = data.codingModes || { agent: {percentage: 0, lines: 0, totalFiles: 0, reviewedFiles: 0}, inline: {percentage: 0, lines: 0, acceptances: 0}, chatPaste: {percentage: 0, lines: 0, files: 0}, totalLines: 0 };

            html += \`
                <div class="collapsible-section">
                    <div class="collapsible-header" onclick="toggleSection('coding-modes')">
                        <span class="expand-icon" id="icon-coding-modes">▼</span>
                        <strong>How You Work With AI</strong>
                        <span class="collapsible-header-info">
                            <span>\${modes.totalLines || 0} total lines</span>
                            <span>·</span>
                            <span>3 modes tracked</span>
                        </span>
                    </div>
                    <div class="collapsible-content" id="content-coding-modes">

                            <!-- Agent Mode - Modern Design -->
                            <div class="mode-card-simple agent">
                                <div class="mode-icon-wrapper">
                                    <span class="mode-icon">🤖</span>
                                </div>
                                <div class="mode-info">
                                    <div class="mode-title">
                                        Agent Mode
                                        <span class="help-icon" data-tooltip="AI agents that modify files while they're closed (e.g., Claude, Cursor Agent)" style="cursor: help; opacity: 0.6; font-size: 12px;">ⓘ</span>
                                    </div>
                                    <div class="mode-stats">\${modes.agent.percentage}% · \${modes.agent.lines} lines · \${modes.agent.totalFiles} files</div>
                                    <div class="mode-description">Files AI modified while closed</div>
                                </div>
                                \${data.unreviewedFiles && data.unreviewedFiles.length > 0 ? \`
                                    <div class="mode-action">
                                        <div class="mode-action-text" style="color: #e74c3c; font-weight: 500;">
                                            ⚠️ \${data.unreviewedFiles.length} files need review
                                        </div>
                                        <button onclick="toggleSection('files-review'); setTimeout(() => { const el = document.getElementById('content-files-review'); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);">
                                            Review Files
                                        </button>
                                    </div>
                                \` : modes.agent.totalFiles > 0 ? \`
                                    <div class="mode-action">
                                        <div class="mode-action-text" style="color: #73c991; font-weight: 500;">
                                            ✓ All reviewed
                                        </div>
                                    </div>
                                \` : \`
                                    <div class="mode-action">
                                        <div class="mode-action-text" style="opacity: 0.6;">No activity today</div>
                                    </div>
                                \`}
                            </div>

                            <!-- Inline Autocomplete - Modern Design -->
                            <div class="mode-card-simple inline">
                                <div class="mode-icon-wrapper">
                                    <span class="mode-icon">💡</span>
                                </div>
                                <div class="mode-info">
                                    <div class="mode-title">
                                        Inline Autocomplete
                                        <span class="help-icon" data-tooltip="Real-time code suggestions as you type (Copilot, Cursor Tab, etc.)" style="cursor: help; opacity: 0.6; font-size: 12px;">ⓘ</span>
                                    </div>
                                    <div class="mode-stats">\${modes.inline.percentage}% · \${modes.inline.lines} lines</div>
                                    <div class="mode-description">Real-time suggestions as you type</div>
                                </div>
                                <div class="mode-action">
                                    <div class="mode-action-text">\${modes.inline.acceptances > 0 ? \`✓ \${modes.inline.acceptances} acceptances\` : '<span style="opacity: 0.6;">No activity today</span>'}</div>
                                </div>
                            </div>

                            <!-- Chat/Paste - Modern Design -->
                            <div class="mode-card-simple chat">
                                <div class="mode-icon-wrapper">
                                    <span class="mode-icon">💬</span>
                                </div>
                                <div class="mode-info">
                                    <div class="mode-title">
                                        Chat/Paste Mode
                                        <span class="help-icon" data-tooltip="Large code blocks pasted from chat interfaces or copied from elsewhere" style="cursor: help; opacity: 0.6; font-size: 12px;">ⓘ</span>
                                    </div>
                                    <div class="mode-stats">\${modes.chatPaste.percentage}% · \${modes.chatPaste.lines} lines</div>
                                    <div class="mode-description">Large code blocks from chat</div>
                                </div>
                                <div class="mode-action">
                                    <div class="mode-action-text">\${modes.chatPaste.lines > 0 ? \`<span class="codicon codicon-file-code"></span> \${modes.chatPaste.files || 1} file(s)\` : '<span style="opacity: 0.6;">No activity today</span>'}</div>
                                </div>
                            </div>

                        </div>
                    </div>
                \`;

            content.innerHTML = html;

            // Setup tooltips after rendering
            setupTooltips();

            // Restore expanded sections after re-render
            restoreExpandedSections();

            // Apply the current filter and sort if tool breakdown exists
            if (data.toolBreakdown.length > 0) {
                applyFilters();
                sortTools(currentSortBy);
            }
            } catch (error) {
                console.error('CodePause: Error rendering dashboard:', error);
                const content = document.getElementById('content');
                if (content) {
                    // SECURITY: Use textContent to prevent XSS attacks
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'empty-state';
                    const h2 = document.createElement('h2');
                    h2.textContent = 'Error';
                    const p = document.createElement('p');
                    p.textContent = error.message; // Safe - textContent auto-escapes
                    errorDiv.appendChild(h2);
                    errorDiv.appendChild(p);
                    content.innerHTML = ''; // Clear existing content
                    content.appendChild(errorDiv);
                }
            }
        }

        function getTrendIcon(trend, inverse = false) {
            if (trend === 'stable') return '→';
            if (inverse) {
                return trend === 'increasing' ? '↑' : '↓';
            }
            return trend === 'increasing' ? '↑' : '↓';
        }

        function formatTime(ms) {
            return (ms / 1000).toFixed(1) + 's';
        }

        function formatToolName(tool) {
            const names = {
                'copilot': 'GitHub Copilot',
                'cursor': 'Cursor AI',
                'claude-code': 'Claude Code'
            };
            // Return known tool name or escape unknown tool name for security
            return names[tool] || escapeHtml(String(tool));
        }

        function getToolIcon(tool) {
            const icons = {
                'copilot': \`<svg class="tool-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>\`,
                'cursor': \`<svg class="tool-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 1L15 8L8 8.5L6 15L1 1Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                </svg>\`,
                'claude-code': \`<svg class="tool-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5A5.5 5.5 0 1113.5 8 5.506 5.506 0 018 13.5z"/>
                    <circle cx="8" cy="8" r="3"/>
                </svg>\`
            };
            return icons[tool] || '';
        }

        function getSemanticTrendClass(trend, preference) {
            if (trend === 'stable') return 'trend-neutral';

            // For metrics where lower is better (AI percentage, blind approvals)
            if (preference === 'lower-better') {
                return trend === 'decreasing' ? 'trend-good' : 'trend-bad';
            }
            // For metrics where higher is better (review time)
            if (preference === 'higher-better') {
                return trend === 'increasing' ? 'trend-good' : 'trend-bad';
            }

            // Default
            return trend === 'increasing' ? 'trend-increasing' : 'trend-decreasing';
        }

        function formatTrendWithMagnitude(trend) {
            const labels = {
                'increasing': 'trending up',
                'decreasing': 'trending down',
                'stable': 'steady'
            };
            return labels[trend] || trend;
        }

        function setupTooltips() {
            const tooltip = document.getElementById('tooltip');
            if (!tooltip) return;

            document.querySelectorAll('[data-tooltip]').forEach(element => {
                element.addEventListener('mouseenter', (e) => {
                    const text = element.getAttribute('data-tooltip');
                    if (!text) return;

                    tooltip.textContent = text;
                    tooltip.classList.add('show');

                    // Position tooltip near the element
                    const rect = element.getBoundingClientRect();
                    tooltip.style.left = rect.left + 'px';
                    tooltip.style.top = (rect.bottom + 5) + 'px';
                });

                element.addEventListener('mouseleave', () => {
                    tooltip.classList.remove('show');
                });
            });
        }

        /**
         * ENHANCED: Open a file for review
         * Sends a message to the extension to open the file in the editor
         */
        function reviewFile(filePath) {
            vscode.postMessage({
                type: 'reviewFile',
                filePath: filePath
            });
        }

        function markAsReviewed(filePath, tool) {
            vscode.postMessage({
                type: 'markAsReviewed',
                filePath: filePath,
                tool: tool
            });
        }

        function sortTools(sortBy) {
            // Store the current sort option
            currentSortBy = sortBy;

            const container = document.getElementById('toolBreakdown');
            if (!container) return;

            const items = Array.from(container.querySelectorAll('.tool-item'));

            items.sort((a, b) => {
                switch (sortBy) {
                    case 'acceptance':
                        return parseInt(b.dataset.acceptance) - parseInt(a.dataset.acceptance);
                    case 'usage':
                        return parseInt(b.dataset.usage) - parseInt(a.dataset.usage);
                    case 'lines':
                        return parseInt(b.dataset.lines) - parseInt(a.dataset.lines);
                    case 'name':
                        return a.dataset.tool.localeCompare(b.dataset.tool);
                    default:
                        return 0;
                }
            });

            // Re-append items in sorted order
            items.forEach(item => container.appendChild(item));
        }

        function toggleToolFilter(toolName) {
            if (selectedTools.has(toolName)) {
                selectedTools.delete(toolName);
            } else {
                selectedTools.add(toolName);
            }
            applyFilters();
            updateFilterCount();
        }

        function selectAllTools() {
            const checkboxes = document.querySelectorAll('.filter-checkboxes input[type="checkbox"]');
            checkboxes.forEach(cb => {
                selectedTools.add(cb.value);
                cb.checked = true;
            });
            applyFilters();
            updateFilterCount();
        }

        function clearAllTools() {
            const checkboxes = document.querySelectorAll('.filter-checkboxes input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = false;
            });
            selectedTools.clear();
            applyFilters();
            updateFilterCount();

            // Close the dropdown after clearing
            const dropdown = document.getElementById('filterDropdown');
            if (dropdown) {
                dropdown.classList.remove('show');
            }
        }

        function applyFilters() {
            const container = document.getElementById('toolBreakdown');
            if (!container) return;

            const items = Array.from(container.querySelectorAll('.tool-item'));
            const filterStatus = document.getElementById('filterStatus');
            const visibleCountEl = document.getElementById('visibleToolCount');

            // Show/hide items based on filter
            // If no tools are selected (selectedTools.size === 0), show all items
            const showAll = selectedTools.size === 0;
            let visibleCount = 0;

            // Remove any existing empty state
            const existingEmpty = container.querySelector('.tool-breakdown-empty');
            if (existingEmpty) {
                existingEmpty.remove();
            }

            items.forEach(item => {
                const toolName = item.dataset.tool;
                if (showAll || selectedTools.has(toolName)) {
                    item.style.display = '';
                    item.style.opacity = '1';
                    visibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            // Update filter status visibility and count
            if (filterStatus && visibleCountEl) {
                if (showAll) {
                    filterStatus.style.display = 'none';
                } else {
                    filterStatus.style.display = 'flex';
                    visibleCountEl.textContent = visibleCount.toString();
                }
            }

            // Show empty state if no tools visible and filters are active
            if (visibleCount === 0 && !showAll) {
                const emptyState = document.createElement('div');
                emptyState.className = 'tool-breakdown-empty';
                emptyState.innerHTML = \`
                    <div class="tool-breakdown-empty-icon">🔍</div>
                    <div style="margin-bottom: 8px; font-weight: 500;">No tools match your filters</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px;">Try selecting different tools or clear your filters</div>
                    <a class="filter-status-clear" onclick="clearAllTools()" style="display: inline-block;">Clear filters</a>
                \`;
                container.appendChild(emptyState);
            }
        }

        function toggleFilterDropdown() {
            const dropdown = document.getElementById('filterDropdown');
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        }

        function updateFilterCount() {
            // Update badge count and active state
            const button = document.getElementById('filterButton');
            if (button) {
                const badge = button.querySelector('.filter-badge');
                const badgeHTML = selectedTools.size > 0 ? \`<span class="filter-badge">\${selectedTools.size}</span>\` : '';

                // Toggle active class
                if (selectedTools.size > 0) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }

                // Replace badge
                if (badge && selectedTools.size === 0) {
                    badge.remove();
                } else if (!badge && selectedTools.size > 0) {
                    button.insertAdjacentHTML('beforeend', badgeHTML);
                } else if (badge) {
                    badge.textContent = selectedTools.size.toString();
                }
            }

            // Update dropdown header count
            const headerCount = document.querySelector('.filter-dropdown-header span:last-child');
            if (headerCount) {
                headerCount.textContent = selectedTools.size === 0 ? 'All tools' : selectedTools.size + ' selected';
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const filterControls = document.querySelector('.filter-controls');
            const dropdown = document.getElementById('filterDropdown');
            if (dropdown && filterControls && !filterControls.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        function showError(message) {
            document.getElementById('content').innerHTML = \`
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h2>Error</h2>
                    <p>\${escapeHtml(message)}</p>
                    <button onclick="refresh()" style="margin-top: 16px;">Try Again</button>
                </div>
            \`;
        }

        // Start auto-refresh and request initial data
        startAutoRefresh();
        refresh();
    </script>
</body>
</html>`;
}
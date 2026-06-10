
$enc = [System.Text.Encoding]::UTF8

# ── Emoji helpers (using Unicode code points to avoid parse issues) ──
function e($cp) {
    if ($cp -gt 0xFFFF) { return [char]::ConvertFromUtf32($cp) }
    return [char]$cp
}
$VAR_SYMBOL = (e 0xFE0F)  # variation selector

$EM = @{
    'cap'     = (e 0x1F393)              # 🎓
    'factory' = (e 0x1F3ED)              # 🏭
    'rocket'  = (e 0x1F680)              # 🚀
    'building'= (e 0x1F3DB)+$VAR_SYMBOL  # 🏛️
    'micro'   = (e 0x1F52C)              # 🔬
    'scroll'  = (e 0x1F4DC)              # 📜
    'books'   = (e 0x1F4DA)              # 📚
    'trophy'  = (e 0x1F3C6)              # 🏆
    'tube'    = (e 0x1F9EA)              # 🧪
    'gear'    = ([char]0x2699)+$VAR_SYMBOL # ⚙️
    'shake'   = (e 0x1F91D)              # 🤝
    'globe'   = (e 0x1F310)              # 🌐
    'search'  = (e 0x1F50E)              # 🔎
    'chart'   = (e 0x1F4CA)             # 📊
    'money'   = (e 0x1F4B0)              # 💰
    'mega'    = (e 0x1F4E3)              # 📣
    'scales'  = ([char]0x2696)+$VAR_SYMBOL # ⚖️
    'teacher' = (e 0x1F468)+([char]0x200D)+(e 0x1F3EB) # 👨‍🏫
    'star'    = (e 0x1F31F)              # 🌟
    'city'    = (e 0x1F306)              # 🌆
    'shield'  = (e 0x1F6E1)+$VAR_SYMBOL  # 🛡️
    'dish'    = (e 0x1F4E1)              # 📡
    'lock'    = (e 0x1F512)              # 🔒
    'office'  = (e 0x1F3E2)              # 🏢
    'trend'   = (e 0x1F4C8)             # 📈
    'chat'    = (e 0x1F4AC)              # 💬
    'email'   = (e 0x1F4E7)              # 📧
    'pin'     = (e 0x1F4CD)              # 📍
    'phone'   = (e 0x1F4DE)             # 📞
    'clock'   = (e 0x1F550)              # 🕐
    'doc'     = (e 0x1F4C4)              # 📄
    'bolt'    = ([char]0x26A1)           # ⚡
    'check'   = ([char]0x2705)           # ✅
    'mail'    = ([char]0x2709)+$VAR_SYMBOL  # ✉️
    'red'     = (e 0x1F534)              # 🔴
    'flock'   = (e 0x1F512)              # 🔒 (same as lock)
}

function i($n) { return "<i data-lucide=`"$n`"></i>" }

$lucideScript = @'
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
    <script>document.addEventListener('DOMContentLoaded',()=>lucide.createIcons());</script>
'@

$iconCSS = @'
        /* ── Lucide icon system ─────────────────────────────────── */
        .opp-icon svg  { width:26px;height:26px;stroke-width:1.5; }
        .info-icon svg { width:22px;height:22px;stroke-width:1.5; }
        .ch-icon svg   { width:20px;height:20px;stroke:#fff;stroke-width:1.5; }
        .story-logo svg{ width:32px;height:32px;stroke-width:1.5;color:var(--accent2); }
        .story-result svg{ width:14px;height:14px;stroke-width:2;display:inline-block;vertical-align:middle;margin-right:4px; }
        .ptab svg      { width:15px;height:15px;stroke-width:1.5;display:inline-block;vertical-align:middle;margin-right:5px; }
        .inq-tab svg   { width:13px;height:13px;stroke-width:1.5;display:inline-block;vertical-align:middle;margin-right:3px; }
        .ci svg, .footer-contact-item .ci svg { width:15px;height:15px;stroke-width:1.5;display:inline-block;vertical-align:middle; }
        .social-link svg{ width:16px;height:16px;stroke-width:1.5; }
        .soc-btn svg   { width:15px;height:15px;stroke-width:1.5;display:inline-block;vertical-align:middle;margin-right:4px; }
        .faq-arrow     { display:flex;align-items:center;justify-content:center; }
        .faq-arrow svg { width:14px;height:14px;stroke-width:2;transition:transform .3s; }
        .faq-item.open .faq-arrow svg { transform:rotate(180deg); }
        .success-icon svg,.check svg { width:56px;height:56px;stroke-width:1.5;color:#10b981;display:block;margin:0 auto; }
        .opp-icon i,.info-icon i,.ch-icon i,.story-logo i { display:flex;align-items:center;justify-content:center;width:100%;height:100%; }
'@

# ═══════════════════════════════════════════════════════════════
# COLLABORATE.HTML
# ═══════════════════════════════════════════════════════════════
$f = 'collaborate.html'
$c = [System.IO.File]::ReadAllText($f, $enc)

$c = $c -replace '(\.mobile-menu a:hover \{[^}]+\})', "`$1`r`n$iconCSS"
$c = $c -replace '</body>', "$lucideScript`r`n</body>"

# Partner tabs
$c = $c.Replace($EM['cap']     + ' Academia',   (i 'graduation-cap') + ' Academia')
$c = $c.Replace($EM['factory'] + ' Industry',   (i 'factory')        + ' Industry')
$c = $c.Replace($EM['rocket']  + ' Startups',   (i 'rocket')         + ' Startups')
$c = $c.Replace($EM['building']+ ' Government', (i 'landmark')       + ' Government')

# Academia cards
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['micro']   + '<', '"opp-icon ic-blue">'   + (i 'microscope')     + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['cap']     + '<', '"opp-icon ic-cyan">'   + (i 'graduation-cap') + '<')
$c = $c.Replace('"opp-icon ic-purple">' + $EM['scroll']  + '<', '"opp-icon ic-purple">' + (i 'award')          + '<')
$c = $c.Replace('"opp-icon ic-gold">'   + $EM['books']   + '<', '"opp-icon ic-gold">'   + (i 'book-open')      + '<')
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['trophy']  + '<', '"opp-icon ic-blue">'   + (i 'trophy')         + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['tube']    + '<', '"opp-icon ic-cyan">'   + (i 'flask-conical')  + '<')

# Industry cards
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['gear']    + '<', '"opp-icon ic-blue">'   + (i 'settings-2')     + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['shake']   + '<', '"opp-icon ic-cyan">'   + (i 'handshake')      + '<')
$c = $c.Replace('"opp-icon ic-purple">' + $EM['globe']   + '<', '"opp-icon ic-purple">' + (i 'globe')          + '<')
$c = $c.Replace('"opp-icon ic-gold">'   + $EM['search']  + '<', '"opp-icon ic-gold">'   + (i 'search')         + '<')
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['chart']   + '<', '"opp-icon ic-blue">'   + (i 'bar-chart-2')    + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['factory'] + '<', '"opp-icon ic-cyan">'   + (i 'layers')         + '<')

# Startups cards
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['rocket']  + '<', '"opp-icon ic-blue">'   + (i 'rocket')         + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['money']   + '<', '"opp-icon ic-cyan">'   + (i 'trending-up')    + '<')
$c = $c.Replace('"opp-icon ic-purple">' + $EM['mega']    + '<', '"opp-icon ic-purple">' + (i 'megaphone')      + '<')
$c = $c.Replace('"opp-icon ic-gold">'   + $EM['scales']  + '<', '"opp-icon ic-gold">'   + (i 'scale')          + '<')
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['teacher'] + '<', '"opp-icon ic-blue">'   + (i 'users')          + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['star']    + '<', '"opp-icon ic-cyan">'   + (i 'star')           + '<')

# Government cards
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['building']+ '<', '"opp-icon ic-blue">'   + (i 'landmark')       + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['city']    + '<', '"opp-icon ic-cyan">'   + (i 'building-2')     + '<')
$c = $c.Replace('"opp-icon ic-purple">' + $EM['shield']  + '<', '"opp-icon ic-purple">' + (i 'shield-check')   + '<')
$c = $c.Replace('"opp-icon ic-gold">'   + $EM['dish']    + '<', '"opp-icon ic-gold">'   + (i 'radio')          + '<')
$c = $c.Replace('"opp-icon ic-blue">'   + $EM['lock']    + '<', '"opp-icon ic-blue">'   + (i 'lock')           + '<')
$c = $c.Replace('"opp-icon ic-cyan">'   + $EM['chart']   + '<', '"opp-icon ic-cyan">'   + (i 'database')       + '<')

# Contact highlights
$c = $c.Replace('<div class="ch-icon">' + $EM['email'] + '</div>', '<div class="ch-icon">' + (i 'mail')    + '</div>')
$c = $c.Replace('<div class="ch-icon">' + $EM['phone'] + '</div>', '<div class="ch-icon">' + (i 'phone')   + '</div>')
$c = $c.Replace('<div class="ch-icon">' + $EM['pin']   + '</div>', '<div class="ch-icon">' + (i 'map-pin') + '</div>')

# Story logos
$c = $c.Replace('<div class="story-logo">' + $EM['office']  + '</div>', '<div class="story-logo">' + (i 'building-2')     + '</div>')
$c = $c.Replace('<div class="story-logo">' + $EM['cap']     + '</div>', '<div class="story-logo">' + (i 'graduation-cap') + '</div>')
$c = $c.Replace('<div class="story-logo">' + $EM['rocket']  + '</div>', '<div class="story-logo">' + (i 'rocket')         + '</div>')

# Story results
$c = $c.Replace($EM['trend'] + ' ', (i 'trending-up')  + ' ')
$c = $c.Replace($EM['chart'] + ' 8', (i 'bar-chart-2') + ' 8')
$c = $c.Replace($EM['money'] + ' ', (i 'coins')        + ' ')

# Form & buttons
$c = $c.Replace('Submit Proposal ' + $EM['rocket'], 'Submit Proposal <i data-lucide="send" style="width:16px;height:16px;stroke-width:1.5;display:inline-block;vertical-align:middle;margin-left:4px;"></i>')
$c = $c.Replace('<div class="check">' + $EM['check'] + '</div>', '<div class="check">' + (i 'check-circle') + '</div>')

# Footer .ci
$c = $c.Replace('<span class="ci">' + $EM['pin']   + '</span>', '<span class="ci">' + (i 'map-pin') + '</span>')
$c = $c.Replace('<span class="ci">' + $EM['mail']  + '</span>', '<span class="ci">' + (i 'mail')    + '</span>')
$c = $c.Replace('<span class="ci">' + $EM['phone'] + '</span>', '<span class="ci">' + (i 'phone')   + '</span>')

# Footer social links
$c = $c.Replace('class="social-link">in</a>', 'class="social-link">' + (i 'linkedin')  + '</a>')
$c = $c.Replace('class="social-link">ig</a>', 'class="social-link">' + (i 'instagram') + '</a>')
$c = $c.Replace('class="social-link">tw</a>', 'class="social-link">' + (i 'twitter')   + '</a>')
$c = $c.Replace('class="social-link">yt</a>', 'class="social-link">' + (i 'youtube')   + '</a>')

[System.IO.File]::WriteAllText($f, $c, $enc)
Write-Host "✅ collaborate.html done"


# ═══════════════════════════════════════════════════════════════
# CONTACT.HTML
# ═══════════════════════════════════════════════════════════════
$f = 'contact.html'
$c = [System.IO.File]::ReadAllText($f, $enc)

$c = $c -replace '(\.mobile-menu a:hover \{[^}]+\})', "`$1`r`n$iconCSS"
$c = $c -replace '</body>', "$lucideScript`r`n</body>"

# Info cards
$c = $c.Replace('"info-icon ic-blue">'   + $EM['pin']   + '</div>', '"info-icon ic-blue">'   + (i 'map-pin') + '</div>')
$c = $c.Replace('"info-icon ic-cyan">'   + $EM['phone'] + '</div>', '"info-icon ic-cyan">'   + (i 'phone')   + '</div>')
$c = $c.Replace('"info-icon ic-green">'  + $EM['clock'] + '</div>', '"info-icon ic-green">'  + (i 'clock')   + '</div>')
$c = $c.Replace('"info-icon ic-purple">' + $EM['globe'] + '</div>', '"info-icon ic-purple">' + (i 'globe')   + '</div>')

# Map footer
$c = $c.Replace('<span>' + $EM['pin'] + ' Nagarabhavi', '<span><i data-lucide="map-pin" style="width:14px;height:14px;stroke-width:1.5;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Nagarabhavi')

# Holiday cell
$c = $c.Replace('Holiday ' + $EM['red'], 'Holiday <span style="background:rgba(239,68,68,.15);color:#ef4444;font-size:10px;font-weight:700;letter-spacing:1px;padding:2px 6px;border-radius:4px;">CLOSED</span>')

# Inquiry tabs (regex for whitespace tolerance)
$c = $c -replace ($EM['chat']  + '\s+General'),     ((i 'message-circle') + ' General')
$c = $c -replace ($EM['shake'] + '\s+Partnership'),  ((i 'handshake')      + ' Partnership')
$c = $c.Replace($EM['doc']   + ' IP Licensing',     (i 'file-text')       + ' IP Licensing')
$c = $c.Replace($EM['cap']   + ' Careers',          (i 'graduation-cap')  + ' Careers')
$c = $c.Replace($EM['bolt']  + ' Products',         (i 'zap')             + ' Products')

# Social buttons
$c = $c.Replace('<span>in</span> LinkedIn',  (i 'linkedin')  + ' LinkedIn')
$c = $c.Replace('<span>ig</span> Instagram', (i 'instagram') + ' Instagram')
$c = $c.Replace('<span>yt</span> YouTube',   (i 'youtube')   + ' YouTube')

# Form success
$c = $c.Replace('<div class="success-icon">' + $EM['check'] + '</div>', '<div class="success-icon">' + (i 'check-circle') + '</div>')

# Footer .ci
$c = $c.Replace('<span class="ci">' + $EM['pin']   + '</span>', '<span class="ci">' + (i 'map-pin') + '</span>')
$c = $c.Replace('<span class="ci">' + $EM['mail']  + '</span>', '<span class="ci">' + (i 'mail')    + '</span>')
$c = $c.Replace('<span class="ci">' + $EM['phone'] + '</span>', '<span class="ci">' + (i 'phone')   + '</span>')
$c = $c.Replace('<span class="ci">' + $EM['clock'] + '</span>', '<span class="ci">' + (i 'clock')   + '</span>')

# Footer social links
$c = $c.Replace('class="social-link">in</a>', 'class="social-link">' + (i 'linkedin')  + '</a>')
$c = $c.Replace('class="social-link">ig</a>', 'class="social-link">' + (i 'instagram') + '</a>')
$c = $c.Replace('class="social-link">tw</a>', 'class="social-link">' + (i 'twitter')   + '</a>')
$c = $c.Replace('class="social-link">yt</a>', 'class="social-link">' + (i 'youtube')   + '</a>')

# FAQ arrows
$c = $c -replace '<span class="faq-arrow">.*?</span>', ('<span class="faq-arrow">' + (i 'chevron-down') + '</span>')

# Toast warnings (remove emoji)
$c = $c -replace ([char]0x26A0 + $VAR_SYMBOL + ' '), ''

[System.IO.File]::WriteAllText($f, $c, $enc)
Write-Host "✅ contact.html done"
Write-Host "`n All icons applied!"

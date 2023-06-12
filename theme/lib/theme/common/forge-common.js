(function () {
    /* global RED, $ */
    // monitorInsertion: derived from https://github.com/naugtur/insertionQuery/blob/master/insQ.min.js (MIT License Copyright (c) 2014-present Zbyszek Tenerowicz <naugtur@gmail.com>)
    // eslint-disable-next-line
    document.head = (document.head || document.getElementsByTagName('head')[0]);
    // eslint-disable-next-line
    const monitorInsertion = (function () { 'use strict'; let m = 100; let t = !1; let u = 'animationName'; let d = ''; const n = 'Webkit Moz O ms Khtml'.split(' '); let e = ''; const i = document.createElement('div'); const s = { strictlyNew: !0, timeout: 20, addImportant: !1 }; if (i.style.animationName && (t = !0), !1 === t) for (let o = 0; o < n.length; o++) if (void 0 !== i.style[n[o] + 'AnimationName']) { e = n[o], u = e + 'AnimationName', d = '-' + e.toLowerCase() + '-', t = !0; break } function c (t) { return s.strictlyNew && !0 === t.QinsQ } function r (t, n) { function e (t) { t.animationName !== o && t[u] !== o || c(t.target) || n(t.target) } let i; var o = 'insQ_' + m++; const r = s.addImportant ? ' !important' : ''; (i = document.createElement('style')).innerHTML = '@' + d + 'keyframes ' + o + ' {  from {  outline: 1px solid transparent  } to {  outline: 0px solid transparent }  }\n' + t + ' { animation-duration: 0.001s' + r + '; animation-name: ' + o + r + '; ' + d + 'animation-duration: 0.001s' + r + '; ' + d + 'animation-name: ' + o + r + ';  } ', document.head.appendChild(i); const a = setTimeout(function () { document.addEventListener('animationstart', e, !1), document.addEventListener('MSAnimationStart', e, !1), document.addEventListener('webkitAnimationStart', e, !1) }, s.timeout); return { destroy: function () { clearTimeout(a), i && (document.head.removeChild(i), i = null), document.removeEventListener('animationstart', e), document.removeEventListener('MSAnimationStart', e), document.removeEventListener('webkitAnimationStart', e) } } } function a (t) { t.QinsQ = !0 } function f (t) { if (t) for (a(t), t = t.firstChild; t; t = t.nextSibling) void 0 !== t && t.nodeType === 1 && f(t) } function l (t, n) { let e; let i = []; const o = function () { clearTimeout(e), e = setTimeout(function () { i.forEach(f), n(i), i = [] }, 10) }; return r(t, function (t) { if (!c(t)) { a(t); const n = (function t (n) { return c(n.parentNode) || n.nodeName === 'BODY' ? n : t(n.parentNode) }(t)); i.indexOf(n) < 0 && i.push(n), o() } }) } function v (n) { return !(!t || !n.match(/[^{}]/)) && (s.strictlyNew && f(document.body), { every: function (t) { return r(n, t) }, summary: function (t) { return l(n, t) } }) } return v.config = function (t) { for (const n in t)t.hasOwnProperty(n) && (s[n] = t[n]) }, v }()); typeof module !== 'undefined' && void 0 !== module.exports && (module.exports = monitorInsertion)

    function changeFavicon (src) {
        const link = document.createElement('link')
        const oldLink = $('link[href="favicon.ico"]')[0] || $('#dynamic-favicon"]')[0]
        link.id = 'dynamic-favicon'
        link.rel = 'shortcut icon'
        link.href = src
        if (oldLink) {
            document.head.removeChild(oldLink)
        }
        document.head.appendChild(link)
    }

    window.addEventListener('load', (_event) => {
        // set favicon
        // eslint-disable-next-line quotes
        const favicon32 = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADzUlEQVR4AcXB206UVxzG4d+71jcbBmYGpjJIg2iHiNYEJaSKrQe4QeMNcOaR11BP2wuwV2JvQSMkxFAiGk1Q8UCjAoJsAkgRZuZb/wJtk6YtuEN4Ht3o7f0B+AXoBhy7w4Bh4FoEXAe+Z3cJ6AauO+Ake+c7B0TsHe/YY4495thjjj0WsdvMMNaZsSHiC7MQwAwkXBSZT6eJ0ml8MmlyziK+ADODEPDJpNU0N1t9qUT94cPkWlvJNDaSzGbxqZTkHBE7yOIYeU/d/v2h2NVFc3c3De3tShcKOO/Ffynic5lhIRDV1FjhyBFr6emh+dQpMk1NTs7xPhGfyEJgQyqft6auLjt48SL7OjqUyGTER4j4CBYCmOGiyOpaWqz59GlrPXdO9W1tcomEeB8z4nLZqqurhEoFC4HI4pgtSWyQc/h02moKBWtob2f/yZNW7OxUTWOjl8R24nLZlicnbe7RI+bHxmx5fFxri4vE5bIsBKJvr1wxzLAQYlsnkLx38t58MkmUTiuZy1Hb1ERtc7PSDQ3Ie8d2zHg3N2dTd++GicFBzY+NaW1hQRbHbJLYJBF1XL3q+FPEZ7I4tsUXL+xVf79NDA7q7fi4s2pVcg4k5D3/FrEDQqVibx48CC9v3tTUyIhW5+cd6+Qc8p7tOHZAqFRs8flz5p8+ZW1hQZghiQ8RsQOiTMYd6evj4IUL9np4OLy8dYu5x49VXVkRziGJrUTjAwO2KYQYEOvknJP35hMJ+XSaVD5PuqFByWwWeS+2kC4U9M3lyzrQ02Ozo6M2PjAQpu/d08rMjKxaFRKS2CSxQb9euhTMTJgZGyQEQjIknPf4VIp0Q4PlDh2i8cQJKx4/rrqWFrkoEtuwEOz36WmbffjQ3ty/r4Vnz1hbWFB1dZVQrWIhoBu9vQEQ2zHDzMAMOUe6ULB9HR124OxZip2dSmaz4j0sBKssL7O2tGSVt2+prKwQl8tEfAgJSfzt3fy8Xt2+rck7d6y+rc1az5+3r8+cobZYdEj8HzmnZC5HMpcT/+D7SqWfAPERJCHnsBC0MjOj6ZERvR4asnczMyFRV0cqn0feiw/g+0qlnwHxiSSxYW1xUbOjo25icJD5J08slMuWqKsjUVODnBNbiNghco4N5aUlTQwOanJoyGqLRQpHj9pXx46FfKmkTLFIMpuVT6Vw3oNzROw0CXkPZlqemmJ5clIv+/uJUilLZrOk8nlL5nJEmQw+kSACYsDxBUgC79kQl8tamZ1lZWZGmPGX2AHD7BJJyDnkPfIeeX/XAdeAO0Bg9wTgN+DHPwAIHJAeMJ00fgAAAABJRU5ErkJggg==`
        changeFavicon(favicon32)

        // monitor #red-ui-header-button-sidemenu & add main menu entries
        monitorInsertion('#red-ui-header-button-sidemenu').summary(function (_arrayOfInsertedNodes) {
            if (!RED) { return }

            RED.menu.addItem('red-ui-header-button-sidemenu', null) // menu seperator
            // add main menu item "About FlowForge"
            RED.menu.addItem('red-ui-header-button-sidemenu', {
                id: 'usermenu-item-ffsite',
                label: 'About FlowForge',
                onselect: function () {
                    window.location = 'https://flowforge.com/'
                }
            })
            // gather info from settings and page - prep for next 2 menu items
            const ffThemeSettings = RED.settings['forge-light'] || RED.settings['forge-dark']
            let projectURL = ''
            if (ffThemeSettings && ffThemeSettings.projectURL) {
                projectURL = ffThemeSettings.projectURL
            } else {
                const img = $('#red-ui-header > span > a > img')
                const ownerHref = img.parent().prop('href')
                // Test the URL is FlowForge Project alike
                if (ownerHref && /http[s]*:\/\/.*\/project\/\w+-\w+-\w+-\w+-\w+.*/.test(ownerHref)) {
                    projectURL = ownerHref
                }
            }
            // if projectURL is present, show link to project in main menu
            if (projectURL) {
                RED.menu.addItem('red-ui-header-button-sidemenu', {
                    id: 'usermenu-item-ffmain',
                    label: 'FlowForge Application',
                    onselect: function () {
                        window.location = projectURL
                    }
                })
            }
            // if theme settings are present, add launcher version entry in main menu
            if (ffThemeSettings && ffThemeSettings.launcherVersion) {
                RED.menu.addItem('red-ui-header-button-sidemenu', {
                    id: 'usermenu-item-fflv',
                    label: 'FlowForge Launcher v' + ffThemeSettings.launcherVersion,
                    onselect: function () {
                        // do nothing
                    }
                })
            }
        })
    })
})()

// Logic for Eco Construction Tracker
let shData = {};
let obraData = {};
// Storage for user-defined dates: "SH-Obra-Item": "yyyy-mm-dd"
let plannedDates = JSON.parse(localStorage.getItem('eco_planned_dates') || '{}');

// Constants
const STAGES = [
    "ANTEPROJETO/ESTUDO",
    "INÍCIO PRELIMINAR OBRA",
    "EXECUTIVO",
    "INÍCIO OBRA",
    "EXECUTIVO CERTIFICADO",
    "FINAL DE OBRA",
    "AS BUILT",
    "CERTIFICADO OBRA",
    "ACEITE ENTREGA OBRA"
];

const DOM = {
    shSelect: document.getElementById('sh-select'),
    mainContent: document.getElementById('main-content'),
    modal: document.getElementById('edit-modal'),
    modalStageName: document.getElementById('modal-stage-name'),
    modalDateInput: document.getElementById('modal-date-input')
};

let currentCtx = null; // { sh, obra, stage }

async function init() {
    try {
        await loadData();
        populateSelectors();
        DOM.shSelect.addEventListener('change', (e) => renderDashboard(e.target.value));
    } catch (e) {
        console.error(e);
        DOM.shSelect.innerHTML = '<option>Erro ao carregar dados</option>';
    }
}

async function loadData() {
    // Load Material File (Safe Header Mode)
    try {
        const matFile = await fetch(encodeURIComponent('Material Ivestimentos GIRON.xlsx')).then(r => r.arrayBuffer());
        const matWorkbook = XLSX.read(matFile, { type: 'array' });
        const matSheet = matWorkbook.Sheets[matWorkbook.SheetNames[0]];
        const matRaw = XLSX.utils.sheet_to_json(matSheet, { header: 1 });

        if (matRaw && matRaw.length > 0) {
            // Find headers
            let shIdx = -1;
            let itemIdx = -1;
            let yearIdx = -1;

            // Scan first 10 rows for headers
            for (let i = 0; i < 10; i++) {
                const r = matRaw[i];
                if (r && Array.isArray(r)) {
                    r.forEach((cell, idx) => {
                        if (!cell) return;
                        const txt = String(cell).toUpperCase().trim();
                        if (txt === 'SH') shIdx = idx;
                        if (txt === 'ITEM') itemIdx = idx;
                        if (txt === 'ANO') yearIdx = idx;
                    });
                    if (shIdx !== -1 && itemIdx !== -1) break;
                }
            }

            if (shIdx !== -1 && itemIdx !== -1) {
                matRaw.forEach(row => {
                    if (!Array.isArray(row)) return;
                    const sh = row[shIdx];
                    const item = row[itemIdx];
                    const year = yearIdx !== -1 ? row[yearIdx] : null;

                    if (sh && item) {
                        if (!shData[sh]) shData[sh] = [];
                        shData[sh].push({ 'Item': item, 'Ano': year, 'SH': sh });
                    }
                });
            }
        }
    } catch (e) {
        console.error("Error loading Material file:", e);
    }

    // FALLBACK: If SH Data is still empty, load dummy data 1-64 as requested
    if (Object.keys(shData).length === 0) {
        console.warn("Using Fallback Data for SH 1-64");
        for (let i = 1; i <= 64; i++) {
            const sh = `SH ${String(i).padStart(2, '0')}`;
            shData[sh] = [{ 'Item': `Obra Exemplo ${i}`, 'Ano': '2025' }];
        }
    }

    // Load ERM File
    try {
        const ermFile = await fetch(encodeURIComponent('ERM - ENTREGÁVEIS GEN.xlsx')).then(r => r.arrayBuffer());
        const ermWorkbook = XLSX.read(ermFile, { type: 'array' });

        // Try to find sheet
        let ermSheet = ermWorkbook.Sheets['CERTIFICAÇÃO PROJETO'];
        if (!ermSheet) {
            const likely = ermWorkbook.SheetNames.find(n => n.toUpperCase().includes('CERTIFICA') && n.toUpperCase().includes('PROJETO'));
            if (likely) ermSheet = ermWorkbook.Sheets[likely];
        }

        if (ermSheet) {
            const ermJson = XLSX.utils.sheet_to_json(ermSheet, { header: 1 });
            // Find Header Row: Look for "OBRA"
            let headerRowIndex = -1;
            for (let i = 0; i < 30; i++) { // Check first 30 rows
                if (ermJson[i] && Array.isArray(ermJson[i])) {
                    // Check cells safely
                    const found = ermJson[i].some(cell => cell && String(cell).toUpperCase() === 'OBRA');
                    if (found) {
                        headerRowIndex = i;
                        break;
                    }
                }
            }

            if (headerRowIndex !== -1) {
                const headers = ermJson[headerRowIndex].map(h => h ? String(h).toUpperCase().trim() : '');
                const dataRows = ermJson.slice(headerRowIndex + 1);

                dataRows.forEach(row => {
                    if (!row || !Array.isArray(row)) return;

                    const obraIdx = headers.indexOf('OBRA');
                    if (obraIdx === -1) return;
                    const obraName = row[obraIdx];

                    if (obraName) {
                        obraData[obraName] = {};
                        STAGES.forEach(stage => {
                            const stageName = stage.toUpperCase();
                            // Loose match for columns
                            const colIdx = headers.findIndex(h => h && (h === stageName || h.includes(stageName)));

                            if (colIdx !== -1) {
                                let val = row[colIdx];
                                if (val) {
                                    if (typeof val === 'number') {
                                        const date = XLSX.SSF.parse_date_code(val);
                                        val = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                                    }
                                    obraData[obraName][stage] = val;
                                }
                            }
                        });
                    }
                });
            } else {
                console.warn("Could not find 'OBRA' header in ERM file.");
            }
        } else {
            console.warn("Sheet CERTIFICAÇÃO PROJETO not found.");
        }
    } catch (e) {
        console.error("Error loading ERM file:", e);
    }
}

function populateSelectors() {
    const sortedSH = Object.keys(shData).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    DOM.shSelect.innerHTML = '<option value="" disabled selected>Selecione um Segmento...</option>';
    sortedSH.forEach(sh => {
        const opt = document.createElement('option');
        opt.value = sh;
        opt.innerText = sh;
        DOM.shSelect.appendChild(opt);
    });
}

function renderDashboard(sh) {
    DOM.mainContent.innerHTML = '';
    const items = shData[sh];
    if (!items) return;

    items.forEach(item => {
        const obraName = item['Item'];
        const year = item['Ano'] || 'ANO ?';
        const stages = obraData[obraName] || {};

        // Calculate Progress
        const totalStages = STAGES.length;
        let completedCount = 0;

        STAGES.forEach(s => {
            const rawReal = stages[s];
            const customKey = `${sh}-${obraName}-${s}-real`;
            const customReal = plannedDates[customKey];
            // If either source has a date, it's considered complete
            if (rawReal || customReal) {
                completedCount++;
            }
        });

        const progressPct = Math.round((completedCount / totalStages) * 100);

        // Wrapper
        const projectWrapper = document.createElement('div');
        projectWrapper.style.marginBottom = '60px';

        // 1. Header Card
        const headCard = document.createElement('div');
        headCard.className = 'project-header-card';
        headCard.innerHTML = `
            <div class="badges">
                <span class="badge green">${year}</span>
                <span class="badge">${sh}</span>
            </div>
            <h1 class="project-title">${obraName}</h1>
            <div class="progress-section">
                <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; color:var(--primary-green); margin-bottom:4px;">
                    <span>PROGRESSO GERAL</span>
                    <span>${progressPct}% CONCLUÍDO</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
                </div>
            </div>
            
            <div style="margin-top:16px; border-top:1px solid #f3f4f6; padding-top:16px;">
                 <button onclick="showPerList('${sh}')" style="display:flex; align-items:center; gap:8px; background:white; border:1px solid #e5e7eb; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; color:var(--text-dark);">
                    <span class="material-symbols-rounded" style="color:var(--primary-green)">list_alt</span>
                    VISUALIZAR ITENS PER / CONTRATUAIS
                 </button>
            </div>
        `;
        projectWrapper.appendChild(headCard);

        // 2. Main Content Grid (Stages Left, Impacts Right)
        const grid = document.createElement('div');
        grid.style.display = 'flex';
        grid.style.gap = '32px';
        grid.style.width = '100%';

        const colLeft = document.createElement('div');
        colLeft.className = 'project-column';

        const colRight = document.createElement('div');
        colRight.className = 'impacts-column';

        // Stages Header
        const listHeader = document.createElement('div');
        listHeader.className = 'section-header';
        listHeader.innerHTML = '<h2><span class="material-symbols-rounded">calendar_today</span> CRONOGRAMA DE ETAPAS</h2>';
        colLeft.appendChild(listHeader);

        let impacts = [];

        STAGES.forEach(stage => {
            const rawRealDate = stages[stage]; // Date from Excel
            const key = `${sh}-${obraName}-${stage}`;
            const plannedDate = plannedDates[key]; // Date from User

            // Determine effective Real Date (User override > Excel)
            const customRealKey = `${key}-real`;
            const customRealDate = plannedDates[customRealKey];
            const finalRealDate = customRealDate || rawRealDate;

            // Status Logic
            let status = 'pending';
            let statusText = 'AGUARDANDO...';
            // Logic:
            // 1. If it has a Real Date (completed) -> Check if it was Late
            // 2. If NO Real Date -> Check if today > Planned Date (Late) OR just Waiting

            if (finalRealDate) {
                status = 'ok';
                statusText = 'NO PRAZO';
                // If we had a plan, did we miss it?
                if (plannedDate) {
                    // Simple string comparison for dates YYYY-MM-DD works, 
                    // providing they are same format.
                    if (finalRealDate > plannedDate) {
                        status = 'delay';
                        statusText = 'ATRASADO';
                    }
                }
            } else {
                // Not finished yet
                if (plannedDate) {
                    const today = new Date().toISOString().split('T')[0];
                    if (today > plannedDate) {
                        status = 'delay';
                        statusText = 'ATRASADO';
                    } else {
                        status = 'pending';
                        statusText = 'AGUARDANDO...';
                    }
                } else {
                    // No plan, no real
                    status = 'pending';
                    statusText = 'A DEFINIR';
                }
            }

            if (status === 'delay') {
                impacts.push({
                    stage: stage,
                    desc: `Atraso no <strong>${stage}</strong> impede o Início das Obras e pode gerar multas de PER.`
                });
            }

            const card = document.createElement('div');
            card.className = 'stage-card';

            const stripe = document.createElement('div');
            stripe.className = `status-stripe ${status}`;
            card.appendChild(stripe);

            const content = document.createElement('div');
            content.className = 'stage-content';

            // Icons
            let icon = 'schedule';
            if (status === 'ok') icon = 'check_circle';
            else if (status === 'delay') icon = 'warning';
            // statusText is preserved from top logic

            // Left Side: Title + Status
            const leftSide = document.createElement('div');
            leftSide.className = 'stage-main';
            leftSide.innerHTML = `
                <div class="stage-title">${stage}</div>
                <div class="stage-status-text text-${status}">
                    <span class="material-symbols-rounded" style="font-size:16px;">${icon}</span>
                    ${statusText}
                </div>
            `;
            content.appendChild(leftSide);

            // Right Side: Dates with Arrows
            const rightSide = document.createElement('div');
            rightSide.className = 'stage-dates';

            // Planned
            const pGroup = document.createElement('div');
            pGroup.className = 'date-group';
            // Clickable planned date
            const pVal = formatDate(plannedDate) || 'Definir';
            const pClass = plannedDate ? '' : 'text-muted';

            pGroup.innerHTML = `
                <span class="date-label">DATA PREVISTA</span>
                <div class="date-val-row ${pClass}" style="cursor:pointer; border-bottom:1px dashed #ccc;" 
                     onclick="openEditModal('${sh}', '${obraName}', '${stage}', '${plannedDate || ''}')">
                    ${pVal} <span class="material-symbols-rounded" style="font-size:14px; color:#94a3b8">edit</span>
                </div>
            `;

            // Separator
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.innerHTML = '<span class="material-symbols-rounded">arrow_right_alt</span>';

            // Real
            const rGroup = document.createElement('div');
            rGroup.className = 'date-group';
            // Use finalRealDate calculated at top
            const rVal = formatDate(finalRealDate) || 'Definir';
            const rStatusClass = status === 'delay' ? 'delay' : '';

            rGroup.innerHTML = `
                <span class="date-label">DATA REAL</span>
                <div class="date-val-row real ${rStatusClass}" style="cursor:pointer; border-bottom:1px dashed #ccc;"
                     onclick="openEditModal('${sh}', '${obraName}', '${stage}', 'real', '${finalRealDate || ''}')">
                    ${rVal} <span class="material-symbols-rounded" style="font-size:14px; color:#94a3b8">edit</span>
                </div>
            `;

            rightSide.appendChild(pGroup);
            rightSide.appendChild(sep);
            rightSide.appendChild(rGroup);

            content.appendChild(rightSide);
            card.appendChild(content);
            colLeft.appendChild(card);
        });

        // Impacts
        const impactCard = document.createElement('div');
        impactCard.className = 'impact-card';
        // Check if there are impacts
        const hasImpacts = impacts.length > 0;

        impactCard.innerHTML = `
            <div class="impact-header" style="background:${hasImpacts ? 'var(--danger)' : 'var(--success)'}">
                <span class="material-symbols-rounded">analytics</span>
                MATRIZ DE IMPACTOS
            </div>
            <div class="impact-body">
                ${hasImpacts
                ? `<div style="margin-bottom:12px; font-size:11px; color:#666; text-transform:uppercase; font-weight:700;">Atenção Requerida:</div>` +
                impacts.map(i => `
                        <div class="impact-item">
                            <div class="impact-title">⚠️ ${i.stage}</div>
                            <div class="impact-desc">${i.desc}</div>
                        </div>
                    `).join('')
                : `<div style="display:flex; flex-direction:column; align-items:center; color:var(--success); padding:20px;">
                            <span class="material-symbols-rounded" style="font-size:32px; margin-bottom:8px;">thumb_up</span>
                            <span style="font-weight:600; font-size:13px;">Cronograma em dia!</span>
                       </div>`
            }
            </div>
        `;
        colRight.appendChild(impactCard);

        // Info Box below impact
        const infoBox = document.createElement('div');
        infoBox.style.marginTop = '16px';
        infoBox.style.background = '#f0f9ff';
        infoBox.style.border = '1px solid #bae6fd';
        infoBox.style.borderRadius = '8px';
        infoBox.style.padding = '12px';
        infoBox.style.fontSize = '12px';
        infoBox.style.lineHeight = '1.4';
        infoBox.style.color = '#0c4a6e';
        infoBox.style.display = 'flex';
        infoBox.style.gap = '8px';
        infoBox.innerHTML = `
            <span class="material-symbols-rounded" style="font-size:16px;">info</span>
            <span>A análise de impacto é gerada automaticamente com base nos parâmetros contratuais (PER) e datas inseridas.</span>
        `;
        colRight.appendChild(infoBox);

        grid.appendChild(colLeft);
        grid.appendChild(colRight);

        projectWrapper.appendChild(grid);
        DOM.mainContent.appendChild(projectWrapper);
    });
}

// Helpers
function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
        const [y, m, d] = isoStr.split('-');
        return `${d}/${m}/${y}`;
    } catch { return isoStr; }
}

// Modal
window.openEditModal = function (sh, obra, stage, type, currentVal) {
    currentCtx = { sh, obra, stage, type }; // type: 'planned' or 'real'
    const typeLabel = type === 'real' ? 'Real' : 'Prevista';
    DOM.modalStageName.innerText = `${obra} > ${stage} (${typeLabel})`;
    DOM.modalDateInput.value = currentVal || '';
    DOM.modal.classList.add('active');
}

window.closeEditModal = function () {
    DOM.modal.classList.remove('active');
    currentCtx = null;
}

window.saveEditModal = function () {
    if (!currentCtx) return;
    const val = DOM.modalDateInput.value;
    let key = `${currentCtx.sh}-${currentCtx.obra}-${currentCtx.stage}`;

    // Append suffix for real dates
    if (currentCtx.type === 'real') {
        key += '-real';
    }

    if (val) plannedDates[key] = val;
    else delete plannedDates[key];

    localStorage.setItem('eco_planned_dates', JSON.stringify(plannedDates));
    closeEditModal();
    renderDashboard(DOM.shSelect.value); // Re-render to update UI
}

// Kickoff
init();

// PER List Modal Logic
window.showPerList = function (sh) {
    const items = shData[sh] || [];

    // Create/Get Modal
    let perModal = document.getElementById('per-modal');
    if (!perModal) {
        perModal = document.createElement('div');
        perModal.id = 'per-modal';
        perModal.className = 'modal-overlay';
        perModal.innerHTML = `
            <div class="modal-box" style="width:600px; max-height:80vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="color:var(--text-dark);">Itens Contratuais (PER)</h3>
                    <button onclick="document.getElementById('per-modal').classList.remove('active')" style="background:none; border:none; cursor:pointer;">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
                <div id="per-list-content" style="overflow-y:auto; flex:1;"></div>
            </div>
        `;
        document.body.appendChild(perModal);
    }

    const contentDiv = perModal.querySelector('#per-list-content');
    if (items.length === 0) {
        contentDiv.innerHTML = '<p style="color:#666;">Nenhum item encontrado.</p>';
    } else {
        contentDiv.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f3f4f6; text-align:left;">
                        <th style="padding:8px; border-bottom:1px solid #ddd;">Item / Obra</th>
                        <th style="padding:8px; border-bottom:1px solid #ddd;">Ano</th>
                        <!-- Add PER page if we captured it, otherwise just Item -->
                    </tr>
                </thead>
                <tbody>
                    ${items.map(i => `
                        <tr>
                            <td style="padding:8px; border-bottom:1px solid #eee;">${i.Item}</td>
                            <td style="padding:8px; border-bottom:1px solid #eee;">${i.Ano || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    perModal.classList.add('active');
}

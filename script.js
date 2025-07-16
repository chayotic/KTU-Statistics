const batches = document.querySelectorAll('.batch-item');
const collegeList = document.getElementById('top-colleges');
const overallDisplay = document.getElementById('overall-percentage');
const fullTableBody = document.getElementById('full-college-table');
const tableHeader = document.getElementById('table-header');

const modal = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalTable = document.getElementById('modal-table-body');
const closeModalBtn = document.getElementById('close-modal');
let chartInstance = null;

let currentColleges = [];
let currentSort = { key: 'rate', direction: 'desc' };

function batchToFilename(batchName) {
  const parts = batchName.split(' - ');
  if (parts.length === 2) {
    return `${parts[0]}-${parts[1].slice(-2)}.json`;
  }
  return batchName.replace(/\s+/g, '-') + '.json';
}

function calculateRankings(colleges) {
  return colleges.map(college => {
    const reg = college["Registration count"];
    const pass = college["All Pass Count"];
    const rate = reg > 0 ? (pass / reg) * 100 : 0;
    return { ...college, rate };
  });
}

function calculatePosition(college) {
  const ranked = [...currentColleges]
    .map(c => {
      const reg = c["Registration count"];
      const pass = c["All Pass Count"];
      const rate = reg > 0 ? (pass / reg) * 100 : 0;
      return { ...c, rate };
    })
    .sort((a, b) => b.rate - a.rate);

  return ranked.findIndex(c => c["Institution"] === college["Institution"]) + 1;
}

function renderFullTable(colleges, sortKey = 'rate', sortDir = 'desc') {
  const rankedColleges = [...calculateRankings(colleges)];

  rankedColleges.sort((a, b) => {
    if (sortKey === 'rate') return sortDir === 'asc' ? a.rate - b.rate : b.rate - a.rate;
    if (sortKey === 'index') return sortDir === 'asc' ? calculatePosition(a) - calculatePosition(b) : calculatePosition(b) - calculatePosition(a);
    if (sortKey === 'reg') return sortDir === 'asc' ? a["Registration count"] - b["Registration count"] : b["Registration count"] - a["Registration count"];
    if (sortKey === 'pass') return sortDir === 'asc' ? a["All Pass Count"] - b["All Pass Count"] : b["All Pass Count"] - a["All Pass Count"];
    if (sortKey === 'name') return sortDir === 'asc' ? a["Institution"].localeCompare(b["Institution"]) : b["Institution"].localeCompare(a["Institution"]);
    return 0;
  });

  fullTableBody.innerHTML = rankedColleges.map(c => {
    return `
      <div class="table-row" data-college="${c["Institution"]}">
        <span>${calculatePosition(c)}</span>
        <span>${c["Institution"]}</span>
        <span>${c["Registration count"]}</span>
        <span>${c["All Pass Count"]}</span>
        <span>${c.rate.toFixed(2)}%</span>
      </div>`;
  }).join('');

  document.querySelectorAll('.table-row').forEach(row => {
    row.addEventListener('click', () => {
      const college = row.getAttribute('data-college');
      showCollegeHistory(college);
    });
  });
}

function loadData(batchName) {
  const file = batchToFilename(batchName);
  fetch(`./data/${file}`)
    .then(res => res.json())
    .then(data => {
      const valid = data.filter(c => c["Registration count"] > 0);
      currentColleges = valid;

      const totalReg = valid.reduce((s, c) => s + c["Registration count"], 0);
      const totalPass = valid.reduce((s, c) => s + c["All Pass Count"], 0);
      const overall = totalReg > 0 ? (totalPass / totalReg * 100).toFixed(2) : "--";
      overallDisplay.textContent = `${overall}%`;

      const top = calculateRankings(valid).sort((a, b) => b.rate - a.rate).slice(0, 5);
      collegeList.innerHTML = top.map(c => `<li><span>${c["Institution"]}</span><span>${c.rate.toFixed(2)}%</span></li>`).join('');
      renderFullTable(currentColleges, currentSort.key, currentSort.direction);
    })
    .catch(err => {
      console.error(err);
      overallDisplay.textContent = "--%";
      collegeList.innerHTML = `<li style="color: red;">Failed to load data</li>`;
      fullTableBody.innerHTML = `<div style="color: red;">Unable to load full table</div>`;
    });
}

function sortColleges(key) {
  const dir = currentSort.key === key && currentSort.direction === 'asc' ? 'desc' : 'asc';
  currentSort = { key, direction: dir };
  renderFullTable(currentColleges, key, dir);
  updateSortIndicators();
}

function updateSortIndicators() {
  const headers = tableHeader.querySelectorAll('span');
  headers.forEach(header => {
    const key = header.getAttribute('data-sort');
    header.classList.remove('active');
    const arrow = header.querySelector('.sort-arrow');
    if (arrow) header.removeChild(arrow);

    if (key === currentSort.key) {
      header.classList.add('active');
      const newArrow = document.createElement('span');
      newArrow.className = 'sort-arrow';
      newArrow.textContent = currentSort.direction === 'asc' ? '▲' : '▼';
      header.appendChild(newArrow);
    }
  });
}

function showCollegeHistory(collegeName) {
  const batchFiles = [
    { label: '2016-2020', file: '2016-20.json' },
    { label: '2017-2021', file: '2017-21.json' },
    { label: '2018-2022', file: '2018-22.json' },
    { label: '2020-2024', file: '2020-24.json' },
    { label: '2021-2025', file: '2021-25.json' }
  ];

  Promise.all(batchFiles.map(b =>
    fetch(`./data/${b.file}`)
      .then(res => res.json())
      .then(data => {
        const found = data.find(c => c["Institution"] === collegeName);
        if (!found) return { ...b, rate: null, rank: '-', reg: '-', pass: '-' };

        const reg = found["Registration count"];
        const pass = found["All Pass Count"];
        const rate = reg > 0 ? (pass / reg * 100).toFixed(2) : '--';

        const rank = data
          .filter(c => c["Registration count"] > 0)
          .map(c => {
            const r = c["Registration count"];
            const p = c["All Pass Count"];
            const rate = r > 0 ? (p / r * 100) : 0;
            return { ...c, rate };
          })
          .sort((a, b) => b.rate - a.rate)
          .findIndex(c => c["Institution"] === collegeName) + 1;

        return { ...b, rate, rank, reg, pass };
      })
  )).then(results => {
    modalTitle.textContent = collegeName;

    const labels = results.map(r => r.label);
    const data = results.map(r => r.rate !== null ? parseFloat(r.rate) : null);

    if (chartInstance) chartInstance.destroy();
    const ctx = document.getElementById('history-chart').getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Pass %',
          data,
          fill: false,
          borderColor: '#52A9FF',
          backgroundColor: '#52A9FF',
          tension: 0.3,
          pointRadius: 3,
          spanGaps: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#EAF6FF', font: { size: 10 } },
            title: {
              display: true,
              text: 'Pass %',
              color: '#ccc',
              font: { size: 12 }
            }
          },
          x: {
            ticks: { color: '#EAF6FF', font: { size: 10 } },
            title: {
              display: true,
              text: 'Batch',
              color: '#ccc',
              font: { size: 12 }
            }
          }
        }
      }
    });

    modalTable.innerHTML = results.map(r => `
      <tr>
        <td>${r.label}</td>
        <td>${r.rank}</td>
        <td>${r.reg}</td>
        <td>${r.rate ? `${r.rate}%` : '--'}</td>
      </tr>
    `).join('');

    modal.style.display = 'flex';
  });
}

batches.forEach(batch => {
  batch.addEventListener('click', () => {
    batches.forEach(b => b.classList.remove('active'));
    batch.classList.add('active');
    loadData(batch.textContent.trim());
    modal.style.display = 'none';
  });
});

closeModalBtn.addEventListener('click', () => {
  modal.style.display = 'none';
});

window.addEventListener('DOMContentLoaded', () => {
  const defaultBatch = document.querySelector('.batch-item.active');
  if (defaultBatch) loadData(defaultBatch.textContent.trim());
});

tableHeader.addEventListener('click', e => {
  const key = e.target.getAttribute('data-sort');
  sortColleges(key);
});

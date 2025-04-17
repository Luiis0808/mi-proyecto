const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const ExcelJS = require('exceljs');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const db = new Database('inventory.db', (err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite');
  }
});

// Crear tablas de materiales y personas (una sola vez)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS materiales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material TEXT,
      cantidad INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ingresos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material TEXT,
      cantidad INTEGER,
      fecha TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS egresos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material TEXT,
      cantidad INTEGER,
      entregado_a TEXT,
      fecha TEXT
    )
  `);
});

// Rutas para obtener materiales y personas
app.get('/api/materiales', (req, res) => {
  db.all('SELECT * FROM materiales', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/personas', (req, res) => {
  db.all('SELECT * FROM personas', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Rutas para agregar materiales y personas
app.post('/api/materiales', (req, res) => {
  const { nombre } = req.body;
  db.run('INSERT INTO materiales (nombre) VALUES (?)', [nombre], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nombre });
  });
});

app.post('/api/personas', (req, res) => {
  const { nombre } = req.body;
  db.run('INSERT INTO personas (nombre) VALUES (?)', [nombre], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nombre });
  });
});

// Rutas para eliminar materiales y personas
app.delete('/api/materiales/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM materiales WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json({ message: 'Material eliminado' });
  });
});

app.delete('/api/personas/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM personas WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json({ message: 'Persona eliminada' });
  });
});

// Registrar ingreso (ahora usa el nombre del material)
app.post('/api/ingresos', (req, res) => {
  const { material, cantidad, fecha } = req.body;

  db.get('SELECT nombre FROM materiales WHERE id = ?', [material], (err, row) => {
    if (err || !row) {
      return res.status(400).json({ error: 'Material no encontrado' });
    }

    const nombreMaterial = row.nombre;

    db.run('INSERT INTO ingresos (material, cantidad, fecha) VALUES (?, ?, ?)', [nombreMaterial, cantidad, fecha], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get('SELECT * FROM inventario WHERE material = ?', [nombreMaterial], (err, inventarioRow) => {
        if (inventarioRow) {
          db.run('UPDATE inventario SET cantidad = cantidad + ? WHERE material = ?', [cantidad, nombreMaterial]);
        } else {
          db.run('INSERT INTO inventario (material, cantidad) VALUES (?, ?)', [nombreMaterial, cantidad]);
        }
      });

      res.status(201).json({ id: this.lastID });
    });
  });
});

// Registrar egreso (ahora usa el nombre del material y de la persona)
app.post('/api/egresos', (req, res) => {
  const { material, cantidad, entregado_a, fecha } = req.body;

  db.get('SELECT nombre FROM materiales WHERE id = ?', [material], (err, row) => {
    if (err || !row) {
      return res.status(400).json({ error: 'Material no encontrado' });
    }

    const nombreMaterial = row.nombre;

    db.get('SELECT nombre FROM personas WHERE id = ?', [entregado_a], (err, personaRow) => {
      if (err || !personaRow) {
        return res.status(400).json({ error: 'Persona no encontrada' });
      }

      const nombrePersona = personaRow.nombre;

      db.get('SELECT * FROM inventario WHERE material = ?', [nombreMaterial], (err, inventarioRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!inventarioRow || inventarioRow.cantidad < cantidad) {
          return res.status(400).json({ error: 'Stock insuficiente o material no encontrado' });
        }

        db.run('UPDATE inventario SET cantidad = cantidad - ? WHERE material = ?', [cantidad, nombreMaterial]);
        db.run('INSERT INTO egresos (material, cantidad, entregado_a, fecha) VALUES (?, ?, ?, ?)', [nombreMaterial, cantidad, nombrePersona, fecha]);

        res.status(200).json({ success: true });
      });
    });
  });
});

// Exportar ingresos a Excel
app.get('/api/exportar/ingresos', async (req, res) => {
  db.all('SELECT * FROM ingresos', async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ingresos');
    sheet.columns = [
      { header: 'ID', key: 'id' },
      { header: 'Material', key: 'material' },
      { header: 'Cantidad', key: 'cantidad' },
      { header: 'Fecha', key: 'fecha' }
    ];
    sheet.addRows(rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ingresos.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  });
});

// Ruta para obtener el stock
app.get('/api/stock', (req, res) => {
  db.all('SELECT * FROM inventario', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Ruta para eliminar material del inventario
app.delete('/api/stock/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM inventario WHERE id = ?', [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(200).json({ message: 'Material eliminado del inventario' });
    });
});

// Exportar egresos a Excel
app.get('/api/exportar/egresos', async (req, res) => {
  db.all('SELECT * FROM egresos', async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Egresos');
    sheet.columns = [
      { header: 'ID', key: 'id' },
      { header: 'Material', key: 'material' },
      { header: 'Cantidad', key: 'cantidad' },
      { header: 'Entregado a', key: 'entregado_a' },
      { header: 'Fecha', key: 'fecha' }
    ];
    sheet.addRows(rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=egresos.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});


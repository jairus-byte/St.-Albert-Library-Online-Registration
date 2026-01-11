const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Initialize SQLite Database
const db = new sqlite3.Database('./library.db', (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Create tables if they don't exist
function initializeDatabase() {
  db.serialize(() => {
    // Students table
    db.run(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentNumber TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        gender TEXT,
        course TEXT NOT NULL,
        year TEXT NOT NULL,
        section TEXT,
        email TEXT,
        phone TEXT,
        birthday TEXT,
        cardExpiry TEXT,
        photo TEXT,
        registeredDate TEXT NOT NULL,
        registeredTime TEXT,
        registeredDateTime TEXT,
        isNew INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating students table:', err);
      } else {
        console.log('✅ Students table ready');
      }
    });

    // Archived students table
    db.run(`
      CREATE TABLE IF NOT EXISTS archived_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        originalId INTEGER,
        studentNumber TEXT,
        name TEXT,
        gender TEXT,
        course TEXT,
        year TEXT,
        section TEXT,
        email TEXT,
        phone TEXT,
        birthday TEXT,
        cardExpiry TEXT,
        photo TEXT,
        registeredDate TEXT,
        registeredTime TEXT,
        registeredDateTime TEXT,
        archivedDate TEXT,
        archivedTime TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating archived_students table:', err);
      } else {
        console.log('✅ Archived students table ready');
      }
    });

    // Activity log table
    db.run(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating activity_log table:', err);
      } else {
        console.log('✅ Activity log table ready');
      }
    });

    // Settings table
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating settings table:', err);
      } else {
        console.log('✅ Settings table ready');
        
        // Initialize default admin credentials
        db.get('SELECT * FROM settings WHERE key = ?', ['admin-credentials'], (err, row) => {
          if (!row) {
            const defaultCreds = JSON.stringify({ username: 'admin', password: 'admin123' });
            db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['admin-credentials', defaultCreds]);
            console.log('✅ Default admin credentials set (admin/admin123)');
          }
        });
      }
    });
  });
}

// ==================== STUDENT ENDPOINTS ====================

// Get all students
app.get('/api/students', (req, res) => {
  console.log('📊 GET /api/students - Fetching all students...');
  
  db.all('SELECT * FROM students ORDER BY registeredDateTime DESC', [], (err, rows) => {
    if (err) {
      console.error('❌ Error fetching students:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Fetched ${rows.length} students from database`);
    res.json(rows);
  });
});

// Add new student
app.post('/api/students', (req, res) => {
  const student = req.body;
  
  console.log('📝 POST /api/students - Registration attempt:', {
    name: student.name,
    studentNumber: student.studentNumber,
    course: student.course,
    hasPhoto: !!student.photo
  });
  
  // Check for duplicate student number
  db.get('SELECT * FROM students WHERE studentNumber = ?', [student.studentNumber], (err, row) => {
    if (err) {
      console.error('❌ Database error (duplicate check):', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (row) {
      console.log('⚠️ Duplicate student number:', student.studentNumber);
      res.status(400).json({ error: 'duplicate', student: row });
      return;
    }
    
    // Insert new student
    const sql = `
      INSERT INTO students 
      (studentNumber, name, gender, course, year, section, email, phone, birthday, cardExpiry, photo,
       registeredDate, registeredTime, registeredDateTime, isNew)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      student.studentNumber || '',
      student.name || '',
      student.gender || '',
      student.course || '',
      student.year || '',
      student.section || '',
      student.email || '',
      student.phone || '',
      student.birthday || '',
      student.cardExpiry || '',
      student.photo || '',
      student.registeredDate || '',
      student.registeredTime || '',
      student.registeredDateTime || new Date().toISOString(),
      1 // isNew
    ];
    
    db.run(sql, params, function(err) {
      if (err) {
        console.error('❌ Database error (insert):', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      
      const newStudent = {
        id: this.lastID,
        ...student,
        isNew: 1
      };
      
      console.log('✅ Student registered successfully:', {
        id: this.lastID,
        name: student.name,
        studentNumber: student.studentNumber
      });
      
      res.status(201).json(newStudent);
    });
  });
});

// Update student
app.put('/api/students/:id', (req, res) => {
  const { id } = req.params;
  const student = req.body;
  
  console.log(`📝 PUT /api/students/${id} - Updating student...`);
  
  const sql = `
    UPDATE students 
    SET name = ?, gender = ?, course = ?, year = ?, section = ?, 
        email = ?, phone = ?, birthday = ?, cardExpiry = ?, photo = ?, isNew = ?
    WHERE id = ?
  `;
  
  const params = [
    student.name,
    student.gender,
    student.course,
    student.year,
    student.section,
    student.email,
    student.phone,
    student.birthday,
    student.cardExpiry,
    student.photo,
    student.isNew ? 1 : 0,
    id
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('❌ Error updating student:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Student ${id} updated successfully`);
    res.json({ id: parseInt(id), ...student });
  });
});

// Delete (Archive) student
app.delete('/api/students/:id', (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️ DELETE /api/students/${id} - Archiving student...`);
  
  // First get the student
  db.get('SELECT * FROM students WHERE id = ?', [id], (err, student) => {
    if (err) {
      console.error('❌ Error fetching student for archive:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!student) {
      console.log('⚠️ Student not found:', id);
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    
    // Archive the student
    const archiveSql = `
      INSERT INTO archived_students 
      (originalId, studentNumber, name, gender, course, year, section, email, phone, birthday, 
       cardExpiry, photo, registeredDate, registeredTime, registeredDateTime, archivedDate, archivedTime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const now = new Date();
    const archiveParams = [
      student.id,
      student.studentNumber,
      student.name,
      student.gender,
      student.course,
      student.year,
      student.section,
      student.email,
      student.phone,
      student.birthday,
      student.cardExpiry,
      student.photo,
      student.registeredDate,
      student.registeredTime,
      student.registeredDateTime,
      now.toLocaleDateString(),
      now.toLocaleTimeString()
    ];
    
    db.run(archiveSql, archiveParams, function(archiveErr) {
      if (archiveErr) {
        console.error('❌ Error archiving student:', archiveErr.message);
        res.status(500).json({ error: archiveErr.message });
        return;
      }
      
      // Delete from active students
      db.run('DELETE FROM students WHERE id = ?', [id], function(deleteErr) {
        if (deleteErr) {
          console.error('❌ Error deleting student:', deleteErr.message);
          res.status(500).json({ error: deleteErr.message });
          return;
        }
        
        console.log(`✅ Student ${id} archived successfully`);
        res.json({ message: 'Student archived successfully' });
      });
    });
  });
});

// ==================== ARCHIVED STUDENTS ENDPOINTS ====================

// Get archived students
app.get('/api/archived', (req, res) => {
  console.log('📊 GET /api/archived - Fetching archived students...');
  
  db.all('SELECT * FROM archived_students ORDER BY archivedDate DESC', [], (err, rows) => {
    if (err) {
      console.error('❌ Error fetching archived students:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Fetched ${rows.length} archived students`);
    res.json(rows);
  });
});

// Restore archived student
app.post('/api/restore/:id', (req, res) => {
  const { id } = req.params;
  
  console.log(`♻️ POST /api/restore/${id} - Restoring student...`);
  
  // Get archived student
  db.get('SELECT * FROM archived_students WHERE id = ?', [id], (err, student) => {
    if (err) {
      console.error('❌ Error fetching archived student:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!student) {
      console.log('⚠️ Archived student not found:', id);
      res.status(404).json({ error: 'Archived student not found' });
      return;
    }
    
    // Restore to students table
    const restoreSql = `
      INSERT INTO students 
      (studentNumber, name, gender, course, year, section, email, phone, birthday, cardExpiry, photo,
       registeredDate, registeredTime, registeredDateTime, isNew)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const restoreParams = [
      student.studentNumber,
      student.name,
      student.gender,
      student.course,
      student.year,
      student.section,
      student.email,
      student.phone,
      student.birthday,
      student.cardExpiry,
      student.photo,
      student.registeredDate,
      student.registeredTime,
      student.registeredDateTime,
      0 // isNew = false for restored students
    ];
    
    db.run(restoreSql, restoreParams, function(restoreErr) {
      if (restoreErr) {
        console.error('❌ Error restoring student:', restoreErr.message);
        res.status(500).json({ error: restoreErr.message });
        return;
      }
      
      // Delete from archive
      db.run('DELETE FROM archived_students WHERE id = ?', [id], function(deleteErr) {
        if (deleteErr) {
          console.error('❌ Error removing from archive:', deleteErr.message);
          res.status(500).json({ error: deleteErr.message });
          return;
        }
        
        console.log(`✅ Student ${id} restored successfully`);
        res.json({ message: 'Student restored successfully' });
      });
    });
  });
});

// Delete archived student permanently
app.delete('/api/archived/:id', (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️ DELETE /api/archived/${id} - Permanently deleting...`);
  
  db.run('DELETE FROM archived_students WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('❌ Error permanently deleting student:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Archived student ${id} permanently deleted`);
    res.json({ message: 'Student permanently deleted' });
  });
});

// ==================== ACTIVITY LOG ENDPOINTS ====================

// Get activity log
app.get('/api/activity', (req, res) => {
  db.all('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 100', [], (err, rows) => {
    if (err) {
      console.error('❌ Error fetching activity log:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Add activity
app.post('/api/activity', (req, res) => {
  const { action, details } = req.body;
  
  db.run(
    'INSERT INTO activity_log (action, details) VALUES (?, ?)',
    [action, details],
    function(err) {
      if (err) {
        console.error('❌ Error adding activity:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, action, details });
    }
  );
});

// ==================== SETTINGS ENDPOINTS ====================

// Get setting
app.get('/api/settings/:key', (req, res) => {
  const { key } = req.params;
  
  db.get('SELECT * FROM settings WHERE key = ?', [key], (err, row) => {
    if (err) {
      console.error('❌ Error fetching setting:', err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || null);
  });
});

// Update setting
app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  
  db.run(
    'INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [key, value],
    function(err) {
      if (err) {
        console.error('❌ Error updating setting:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ key, value });
    }
  );
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('🎓 NDHSCCI Library System Server');
  console.log('========================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/students`);
  console.log('========================================');
  console.log('');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️ Shutting down server...');
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed');
    }
    process.exit(0);
  });
});
<?php

// Static scanner fixture. The database contains only synthetic rows.
function lookupPublicNote(): array
{
    $db = new PDO('sqlite::memory:');
    $db->exec('CREATE TABLE notes (id INTEGER, visibility TEXT, body TEXT)');
    $db->exec("INSERT INTO notes VALUES (1, 'public', 'demo one'), (2, 'private', 'demo two')");

    $id = $_GET['id'] ?? '1';
    return $db->query("SELECT body FROM notes WHERE visibility = 'public' AND id = $id")
        ->fetchAll(PDO::FETCH_COLUMN);
}

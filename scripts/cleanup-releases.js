const { execSync } = require('child_process');

function cleanup() {
  try {
    // 1. Get all releases from GitHub
    console.log('Fetching releases from GitHub...');
    const releasesOutput = execSync('gh release list --limit 100').toString().trim();
    if (!releasesOutput) {
      console.log('No releases found.');
      return;
    }

    const releases = releasesOutput.split('\n').map(line => line.split('\t')[0]);
    console.log(`Found ${releases.length} releases.`);

    if (releases.length > 3) {
      const releasesToDelete = releases.slice(3); // Keep top 3
      console.log(`Releases to delete: ${releasesToDelete.join(', ')}`);

      for (const tag of releasesToDelete) {
        console.log(`Deleting release and tag: ${tag}`);
        
        // Delete GitHub release
        try {
          execSync(`gh release delete ${tag} --yes`);
          console.log(`- GitHub release ${tag} deleted.`);
        } catch (e) {
          console.error(`- Error deleting GitHub release ${tag}: ${e.message}`);
        }

        // Delete remote tag
        try {
          execSync(`git push --delete origin ${tag}`);
          console.log(`- Remote tag ${tag} deleted.`);
        } catch (e) {
          console.error(`- Error deleting remote tag ${tag}: ${e.message}`);
        }

        // Delete local tag
        try {
          execSync(`git tag -d ${tag}`);
          console.log(`- Local tag ${tag} deleted.`);
        } catch (e) {
          console.error(`- Error deleting local tag ${tag}: ${e.message}`);
        }
      }
    } else {
      console.log('3 or fewer releases found. No cleanup needed.');
    }

    // 2. Extra safety: cleanup local tags that might not have releases
    const localTags = execSync('git tag --sort=-v:refname').toString().trim().split('\n');
    if (localTags.length > 3) {
        const extraTags = localTags.slice(3);
        for (const tag of extraTags) {
            try {
                execSync(`git tag -d ${tag}`);
                console.log(`- Extra local tag ${tag} removed.`);
            } catch (e) {
                // Ignore errors for tags already deleted
            }
        }
    }

  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
}

cleanup();

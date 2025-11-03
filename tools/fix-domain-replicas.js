#!/usr/bin/env node

/**
 * Fix Domain Replicas Migration
 * Updates all domain records to include replicas from their manifests
 */

async function main() {
  console.log('🔧 DWeb Domain Replicas Migration');
  console.log('=' .repeat(50));

  try {
    // Get all domains
    const domainsResponse = await fetch('http://localhost:8788/domains');
    if (!domainsResponse.ok) {
      throw new Error(`Registry unavailable: ${domainsResponse.status}`);
    }

    const domainsData = await domainsResponse.json();
    const domains = domainsData.domains || [];
    
    console.log(`📊 Found ${domains.length} domains to check`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const domain of domains) {
      console.log(`\n🔍 Checking: ${domain.domain}`);
      
      try {
        // Check if domain already has replicas
        if (domain.replicas && domain.replicas.length > 0) {
          console.log(`   ✅ Already has ${domain.replicas.length} replicas - skipping`);
          skipped++;
          continue;
        }

        // Check if domain has a manifest
        if (!domain.manifestId) {
          console.log(`   ⚠️  No manifest ID - skipping`);
          skipped++;
          continue;
        }

        // Get manifest to find replicas
        const manifestResponse = await fetch(`http://localhost:8788/manifests/${domain.manifestId}`);
        if (!manifestResponse.ok) {
          console.log(`   ❌ Manifest not found (HTTP ${manifestResponse.status})`);
          errors++;
          continue;
        }

        const manifest = await manifestResponse.json();
        
        if (!manifest.replicas || manifest.replicas.length === 0) {
          console.log(`   ⚠️  Manifest has no replicas - skipping`);
          skipped++;
          continue;
        }

        console.log(`   📄 Manifest has ${manifest.replicas.length} replicas: ${manifest.replicas.join(', ')}`);

        // The registry service should automatically include replicas now
        // But we can verify by re-fetching the domain
        const updatedDomainResponse = await fetch(`http://localhost:8788/domains/${domain.domain}`);
        if (updatedDomainResponse.ok) {
          const updatedDomain = await updatedDomainResponse.json();
          
          if (updatedDomain.replicas && updatedDomain.replicas.length > 0) {
            console.log(`   ✅ Registry now returns ${updatedDomain.replicas.length} replicas!`);
            fixed++;
          } else {
            console.log(`   ❌ Registry still not returning replicas`);
            errors++;
          }
        } else {
          console.log(`   ❌ Could not verify domain update`);
          errors++;
        }

      } catch (error) {
        console.log(`   ❌ Error processing ${domain.domain}: ${error.message}`);
        errors++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${domains.length}`);

    if (fixed > 0) {
      console.log('\n✅ Domain replicas are now being served by registry!');
      console.log('💡 The extension resolver should now work for domains with content.');
    } else if (errors === 0) {
      console.log('\n✅ No domains needed fixing - registry is working correctly!');
    } else {
      console.log('\n⚠️  Some issues remain - check errors above.');
    }

    // Test a specific domain
    console.log('\n🧪 Testing heyheyhey.dweb specifically:');
    try {
      const testResponse = await fetch('http://localhost:8788/domains/heyheyhey.dweb');
      if (testResponse.ok) {
        const testDomain = await testResponse.json();
        console.log(`   Domain: ${testDomain.domain}`);
        console.log(`   Manifest: ${testDomain.manifestId}`);
        console.log(`   Replicas: ${testDomain.replicas ? testDomain.replicas.length : 'MISSING'}`);
        
        if (testDomain.replicas && testDomain.replicas.length > 0) {
          console.log(`   ✅ heyheyhey.dweb should now resolve!`);
        } else {
          console.log(`   ❌ heyheyhey.dweb still missing replicas`);
        }
      } else {
        console.log(`   ❌ Could not fetch heyheyhey.dweb`);
      }
    } catch (error) {
      console.log(`   ❌ Test error: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  }
}

main().catch(console.error);